import os
import uuid
from contextvars import ContextVar
from typing import Annotated
from urllib.parse import urlparse

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.ui import AnyUIMessage, push_ui_message, ui_message_reducer

from models import default_model, find_model

EFFORTS = {"low", "medium", "high"}
_models: dict[tuple[str, str | None], ChatOpenAI] = {}

# Id shared by every streamed chunk and the final message of one model call, so clients
# merge them into a single message and can attach UI (web search) to it.
_message_id: ContextVar[str | None] = ContextVar("message_id", default=None)


class State(MessagesState):
    ui: Annotated[list[AnyUIMessage], ui_message_reducer]


def _search_queries(block: dict) -> list[str]:
    action = block.get("action") or {}
    queries = action.get("queries") or ([action["query"]] if action.get("query") else [])
    return [q for q in queries if isinstance(q, str)]


def _push_web_search(message_id: str, props: dict) -> None:
    # Same ui id each time, so later pushes replace the earlier "searching" card.
    push_ui_message(
        "web_search",
        props,
        id=f"web-search-{message_id}",
        message=AIMessage(content="", id=message_id),
    )


class ChatOpenAIStableId(ChatOpenAI):
    """The Responses API stamps its final chunk with a `resp_...` id while earlier chunks get
    `lc_run--...`, so clients see two messages and render the answer twice. Giving every chunk
    one id per call fixes that, and lets us show the web search as soon as it happens."""

    def _tag(self, chunk, state: dict) -> None:
        message_id = _message_id.get()
        chunk.message.id = message_id
        if not message_id or not isinstance(chunk.message.content, list):
            return
        for block in chunk.message.content:
            if isinstance(block, dict) and block.get("type") == "web_search_call":
                new = [q for q in _search_queries(block) if q not in state["queries"]]
                if new:  # push only when there is something new to show
                    state["queries"] += new
                    _push_web_search(message_id, {"status": "searching", "queries": state["queries"], "sources": []})

    def _stream(self, *args, **kwargs):
        state = {"queries": []}
        for chunk in super()._stream(*args, **kwargs):
            self._tag(chunk, state)
            yield chunk

    async def _astream(self, *args, **kwargs):
        state = {"queries": []}
        async for chunk in super()._astream(*args, **kwargs):
            self._tag(chunk, state)
            yield chunk


def get_model(name: str, effort: str | None = None) -> ChatOpenAI:
    """Use a LiteLLM proxy (OpenAI-compatible) when configured, else OpenAI directly."""
    key = (name, effort)
    if key not in _models:
        # Always the Responses API; reasoning models also stream readable reasoning summaries.
        kwargs: dict = {
            "model": name,
            "streaming": True,
            "use_responses_api": True,
            "output_version": "responses/v1",
        }
        if effort:
            kwargs["reasoning"] = {"effort": effort, "summary": "detailed"}
        base_url = os.environ.get("LITELLM_BASE_URL")
        if base_url:
            kwargs["base_url"] = base_url.rstrip("/") + "/v1"
            kwargs["api_key"] = os.environ["LITELLM_API_KEY"]
        _models[key] = ChatOpenAIStableId(**kwargs)
    return _models[key]


def _web_search_summary(response: AIMessage) -> tuple[list[str], list[dict]]:
    """Queries the model searched and the pages its answer cites."""
    queries: list[str] = []
    sources: dict[str, dict] = {}
    for block in response.content if isinstance(response.content, list) else []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "web_search_call":
            queries += [q for q in _search_queries(block) if q not in queries]
        elif block.get("type") == "text":
            for note in block.get("annotations") or []:
                url = note.get("url")
                if note.get("type") == "url_citation" and url and url not in sources:
                    host = urlparse(url).netloc.removeprefix("www.")
                    sources[url] = {"title": note.get("title") or host, "url": url, "domain": host}
    return queries, list(sources.values())


def call_model(state: State, config: RunnableConfig):
    configurable = config.get("configurable") or {}
    # Only models the proxy actually offers; anything else falls back to the default.
    info = find_model(configurable.get("model")) or find_model(default_model())
    name = info["id"] if info else default_model()
    # Thinking level only applies to reasoning models, and only to known levels.
    effort = None
    if info and info["supports_reasoning"]:
        requested = configurable.get("reasoning_effort")
        effort = requested if requested in EFFORTS else "medium"

    model = get_model(name, effort)
    # Built-in web search runs on the provider's side; offer it where the proxy says it works.
    if info and info["supports_web_search"]:
        model = model.bind_tools([{"type": "web_search"}])

    message_id = f"ai-{uuid.uuid4().hex}"
    token = _message_id.set(message_id)
    try:
        response = model.invoke(state["messages"], config)
    finally:
        _message_id.reset(token)
    response.id = message_id

    queries, sources = _web_search_summary(response)
    if queries or sources:
        _push_web_search(message_id, {"status": "done", "queries": queries, "sources": sources})
    return {"messages": [response]}


workflow = StateGraph(State)
workflow.add_node("agent", call_model)
workflow.add_edge(START, "agent")
workflow.add_edge("agent", END)

graph = workflow.compile()
