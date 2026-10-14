"""Follow-up prompt suggestions for the chat, generated after a reply is complete."""
import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from agent import get_model
from models import default_model, find_model

SYSTEM = (
    "You write follow-up prompts for a chat assistant. From the last exchange, suggest exactly "
    "3 short, distinct things the USER might want to ask next, phrased the way the user would "
    "type them (first person, at most 9 words each, no numbering). Reply with ONLY a JSON array "
    "of 3 strings, without markdown fences."
)


def _text(content) -> str:
    if isinstance(content, str):
        return content
    return "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")


def suggest(turns: list[dict], requested_model: str | None) -> list[str]:
    """Up to three follow-up prompts; an empty list when anything goes wrong."""
    info = find_model(requested_model) or find_model(default_model())
    name = info["id"] if info else default_model()
    effort = "low" if info and info["supports_reasoning"] else None
    transcript = "\n\n".join(f"{t['role'].upper()}: {t['text'][:1500]}" for t in turns[-2:])
    try:
        reply = get_model(name, effort, summary=False).invoke(
            [SystemMessage(SYSTEM), HumanMessage(transcript)]
        )
        match = re.search(r"\[.*\]", _text(reply.content), re.DOTALL)
        items = json.loads(match.group(0)) if match else []
    except Exception:
        return []
    seen: list[str] = []
    for item in items:
        if isinstance(item, str) and (text := item.strip().strip('"')) and text not in seen:
            seen.append(text[:90])
    return seen[:3]
