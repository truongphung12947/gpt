import os

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph


def build_model() -> ChatOpenAI:
    """Use a LiteLLM proxy (OpenAI-compatible) when configured, else OpenAI directly."""
    base_url = os.environ.get("LITELLM_BASE_URL")
    if base_url:
        return ChatOpenAI(
            model=os.environ["LITELLM_MODEL"],
            base_url=base_url.rstrip("/") + "/v1",
            api_key=os.environ["LITELLM_API_KEY"],
            streaming=True,
        )
    return ChatOpenAI(model="gpt-6-luna", streaming=True)


model = build_model()


def call_model(state: MessagesState):
    return {"messages": [model.invoke(state["messages"])]}


workflow = StateGraph(MessagesState)
workflow.add_node("agent", call_model)
workflow.add_edge(START, "agent")
workflow.add_edge("agent", END)

graph = workflow.compile()
