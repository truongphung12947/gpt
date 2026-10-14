"""Authentication for the LangGraph server.

The chat app is the only caller: it signs a short-lived token (HMAC, shared secret
GRAPH_AUTH_SECRET) for the signed-in user. Every thread is tagged with its owner and
every thread operation is filtered by it, so users never see each other's chats.
"""
import base64
import hashlib
import hmac
import json
import os
import time

from langgraph_sdk import Auth

auth = Auth()


def _verify(token: str) -> dict:
    secret = os.environ.get("GRAPH_AUTH_SECRET", "")
    if not secret:
        raise Auth.exceptions.HTTPException(status_code=500, detail="Auth not configured")
    try:
        body, sig = token.split(".", 1)
        want = base64.urlsafe_b64encode(
            hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
        ).rstrip(b"=").decode()
        if not hmac.compare_digest(sig, want):
            raise ValueError("bad signature")
        claims = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if claims["exp"] < time.time() or not claims["sub"]:
            raise ValueError("expired")
        return claims
    except Exception:
        raise Auth.exceptions.HTTPException(status_code=401, detail="Invalid token")


@auth.authenticate
async def authenticate(authorization: str | None) -> Auth.types.MinimalUserDict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Auth.exceptions.HTTPException(status_code=401, detail="Missing token")
    claims = _verify(authorization[7:].strip())
    return {"identity": claims["sub"], "display_name": claims.get("email") or claims["sub"]}


@auth.on
async def owner_only(ctx: Auth.types.AuthContext, value: dict):
    owner = ctx.user.identity
    metadata = value.setdefault("metadata", {})
    metadata["owner"] = owner
    return {"owner": owner}


@auth.on.assistants
async def assistants_shared(ctx: Auth.types.AuthContext, value: dict):
    # The built-in assistant is shared by everyone; only threads are private.
    return None
