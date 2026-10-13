from fastapi import FastAPI

from models import available_models, default_model

app = FastAPI()


@app.get("/models")
def list_models():
    models = available_models()
    ids = [m["id"] for m in models]
    default = default_model()
    return {"models": models, "default": default if default in ids else ids[0]}
