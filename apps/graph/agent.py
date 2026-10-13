import os

from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph

from models import available_models, default_model

_models: dict[str, ChatOpenAI] = {}


def get_model(name: str) -> ChatOpenAI:
    """Use a LiteLLM proxy (OpenAI-compatible) when configured, else OpenAI directly."""
    if name not in _models:
        base_url = os.environ.get("LITELLM_BASE_URL")
        if base_url:
            _models[name] = ChatOpenAI(
                model=name,
                base_url=base_url.rstrip("/") + "/v1",
                api_key=os.environ["LITELLM_API_KEY"],
                streaming=True,
            )
        else:
            _models[name] = ChatOpenAI(model=name, streaming=True)
    return _models[name]


def call_model(state: MessagesState, config: RunnableConfig):
    requested = (config.get("configurable") or {}).get("model")
    # Only models the proxy actually offers; anything else falls back to the default.
    name = requested if requested in available_models() else default_model()
    return {"messages": [get_model(name).invoke(state["messages"], config)]}


workflow = StateGraph(MessagesState)
workflow.add_node("agent", call_model)
workflow.add_edge(START, "agent")
workflow.add_edge("agent", END)

graph = workflow.compile()
