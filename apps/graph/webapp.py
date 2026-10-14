from fastapi import FastAPI
from pydantic import BaseModel

from followups import suggest
from models import available_models, default_model

app = FastAPI()


@app.get("/models")
def list_models():
    models = available_models()
    ids = [m["id"] for m in models]
    default = default_model()
    return {"models": models, "default": default if default in ids else ids[0]}


class Turn(BaseModel):
    role: str
    text: str


class SuggestionsRequest(BaseModel):
    messages: list[Turn]
    model: str | None = None


@app.post("/suggestions")
def follow_up_suggestions(request: SuggestionsRequest):
    prompts = suggest([t.model_dump() for t in request.messages], request.model)
    return {"suggestions": [{"prompt": p} for p in prompts]}
