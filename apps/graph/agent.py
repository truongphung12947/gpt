import os

from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph

from models import default_model, find_model

EFFORTS = {"low", "medium", "high"}


class ChatOpenAIStableId(ChatOpenAI):
    """The Responses API stamps its final chunk with a `resp_...` id while earlier chunks get
    `lc_run--...`, so clients see two messages and render the answer twice. Dropping the
    provider ids lets LangChain give every chunk (and the final message) one run-scoped id."""

    def _stream(self, *args, **kwargs):
        for chunk in super()._stream(*args, **kwargs):
            chunk.message.id = None
            yield chunk

    async def _astream(self, *args, **kwargs):
        async for chunk in super()._astream(*args, **kwargs):
            chunk.message.id = None
            yield chunk
_models: dict[tuple[str, str | None], ChatOpenAI] = {}


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


def call_model(state: MessagesState, config: RunnableConfig):
    configurable = config.get("configurable") or {}
    # Only models the proxy actually offers; anything else falls back to the default.
    info = find_model(configurable.get("model")) or find_model(default_model())
    name = info["id"] if info else default_model()
    # Thinking level only applies to reasoning models, and only to known levels.
    effort = None
    if info and info["supports_reasoning"]:
        requested = configurable.get("reasoning_effort")
        effort = requested if requested in EFFORTS else "medium"
    return {"messages": [get_model(name, effort).invoke(state["messages"], config)]}


workflow = StateGraph(MessagesState)
workflow.add_node("agent", call_model)
workflow.add_edge(START, "agent")
workflow.add_edge("agent", END)

graph = workflow.compile()
