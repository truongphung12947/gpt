#!/usr/bin/env bash
# Deploys apps/graph (internal) then apps/chat (public) and prints the chat URL.
# Requires: az logged in, AZURE_RESOURCE_GROUP set.
# OPENAI_API_KEY comes from the environment or apps/graph/.env; when neither has it,
# an already-deployed graph keeps its stored secret and only the image is updated.
# Sign-in is email + password for the people in AUTH_USERS (entries made with
# `node scripts/hash-password.mjs <email>`, comma separated). Missing values are reused from the
# deployed chat app. Nothing is deployed unless AUTH_USERS resolves, because the graph rejects
# requests from a chat app without sign-in. AUTH_SECRET and GRAPH_AUTH_SECRET are generated on
# the first deploy and then reused.
# Chats are stored in Azure Database for PostgreSQL (infra/postgres.bicep, created on the first
# deploy, ~$13/month for the smallest size). Its connection string is kept as the secret
# `database-url` on both apps (and, as a backup, in ~/.gpt-database-url, mode 600); set
# DATABASE_URL to use another database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RG="${AZURE_RESOURCE_GROUP:?}"
ACR="$(az acr list -g "$RG" --query '[0].name' -o tsv)"
LOGIN="$(az acr show -n "$ACR" --query loginServer -o tsv)"
TAG="$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet HEAD -- apps infra 2>/dev/null || echo "-$(date +%H%M%S)")"

if [ -z "${OPENAI_API_KEY:-}" ] && [ -f "$ROOT/apps/graph/.env" ]; then
  OPENAI_API_KEY="$(sed -n 's/^OPENAI_API_KEY=//p' "$ROOT/apps/graph/.env" | head -1)"
fi
export OPENAI_API_KEY="${OPENAI_API_KEY:-}"

existing_secret() { az containerapp secret show -n "$1" -g "$RG" --secret-name "$2" --query value -o tsv 2>/dev/null || true; }
[ -n "${AUTH_USERS:-}" ] || export AUTH_USERS="$(existing_secret chat auth-users)"
[ -n "${AUTH_SECRET:-}" ] || export AUTH_SECRET="$(existing_secret chat auth-secret)"
[ -n "${AUTH_SECRET:-}" ] || export AUTH_SECRET="$(openssl rand -base64 32)"
[ -n "${GRAPH_AUTH_SECRET:-}" ] || export GRAPH_AUTH_SECRET="$(existing_secret graph graph-auth-secret)"
[ -n "${GRAPH_AUTH_SECRET:-}" ] || export GRAPH_AUTH_SECRET="$(openssl rand -base64 32)"
[ -n "${AUTH_USERS:-}" ] || { echo "AUTH_USERS is not set (and not stored on the chat app); see the header of this script" >&2; exit 1; }

# --- Postgres (durable chats) ---
DB_FILE="$HOME/.gpt-database-url"
[ -n "${DATABASE_URL:-}" ] || export DATABASE_URL="$(existing_secret chat database-url)"
[ -n "${DATABASE_URL:-}" ] || { [ ! -f "$DB_FILE" ] || export DATABASE_URL="$(cat "$DB_FILE")"; }
if [ -z "${DATABASE_URL:-}" ]; then
  PG_NAME="gpt-pg-$(printf %s "${AZURE_SUBSCRIPTION_ID:-}/$RG" | sha1sum | cut -c1-8)"
  if az postgres flexible-server show -g "$RG" -n "$PG_NAME" >/dev/null 2>&1; then
    echo "Postgres server $PG_NAME exists but its connection string is not stored; set DATABASE_URL" >&2; exit 1
  fi
  PG_PASS="$(openssl rand -hex 24)"
  PG_FQDN="$(az deployment group create -g "$RG" -f "$ROOT/infra/postgres.bicep" \
    -p serverName="$PG_NAME" administratorLoginPassword="$PG_PASS" --query properties.outputs.fqdn.value -o tsv)"
  export DATABASE_URL="postgresql://chatadmin:${PG_PASS}@${PG_FQDN}:5432/chat?sslmode=require"
  (umask 077; printf %s "$DATABASE_URL" > "$DB_FILE")
fi

# --- graph (internal ingress, single replica: threads live in memory) ---
az acr build --no-logs -r "$ACR" -t "graph:$TAG" "$ROOT/apps/graph" >/dev/null
GRAPH_IMAGE="$LOGIN/graph:$TAG"
# LiteLLM (OpenAI-compatible proxy) is used when LITELLM_BASE_URL + LITELLM_MODEL are set.
# The app gets LITELLM_API_KEY; the admin key is only used if LITELLM_ALLOW_ADMIN_KEY=1.
LITELLM_KEY="${LITELLM_API_KEY:-}"
if [ -z "$LITELLM_KEY" ] && [ "${LITELLM_ALLOW_ADMIN_KEY:-}" = "1" ]; then LITELLM_KEY="${LITELLM_ADMIN_KEY:-}"; fi
export LITELLM_KEY
if [ -n "${LITELLM_BASE_URL:-}" ] && { [ -z "${LITELLM_MODEL:-}" ] || [ -z "$LITELLM_KEY" ]; }; then
  echo "LITELLM_BASE_URL is set but LITELLM_MODEL or a LiteLLM key is missing" >&2; exit 1
fi

if [ -n "${OPENAI_API_KEY:-}" ] || [ -n "$LITELLM_KEY" ]; then  # (secrets are only re-sent when a model key is available)
  PF="$(mktemp)"; trap 'rm -f "$PF"' EXIT; chmod 600 "$PF"
  python3 - "$PF" <<'PY'
import json, os, sys
secrets, env = {"graph-auth-secret": os.environ["GRAPH_AUTH_SECRET"],
                "database-url": os.environ["DATABASE_URL"]}, [
    {"name": "GRAPH_AUTH_SECRET", "secretRef": "graph-auth-secret"},
    {"name": "DATABASE_URL", "secretRef": "database-url"}]
if os.environ.get("OPENAI_API_KEY"):
    secrets["openai-api-key"] = os.environ["OPENAI_API_KEY"]
    env.append({"name": "OPENAI_API_KEY", "secretRef": "openai-api-key"})
if os.environ.get("LITELLM_BASE_URL") and os.environ.get("LITELLM_KEY"):
    secrets["litellm-api-key"] = os.environ["LITELLM_KEY"]
    env += [{"name": "LITELLM_API_KEY", "secretRef": "litellm-api-key"},
            {"name": "LITELLM_BASE_URL", "value": os.environ["LITELLM_BASE_URL"]},
            {"name": "LITELLM_MODEL", "value": os.environ["LITELLM_MODEL"]}]
json.dump({"$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {"secretValues": {"value": secrets}, "env": {"value": env}}}, open(sys.argv[1], "w"))
PY
  GRAPH_FQDN="$(az deployment group create -g "$RG" -f "$ROOT/infra/app.bicep" -p "@$PF" \
    -p appName=graph image="$GRAPH_IMAGE" targetPort=2024 acrLoginServer="$LOGIN" \
       externalIngress=false minReplicas=1 maxReplicas=1 cpu=0.5 memory=1Gi \
    --query properties.outputs.fqdn.value -o tsv)"
else
  az containerapp update -n graph -g "$RG" --image "$GRAPH_IMAGE" >/dev/null
  GRAPH_FQDN="$(az containerapp show -n graph -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
fi

# --- chat (public); the graph URL is baked into the image as LANGGRAPH_INTERNAL_URL ---
az acr build --no-logs -r "$ACR" -t "chat:$TAG" --build-arg "LANGGRAPH_INTERNAL_URL=https://$GRAPH_FQDN" "$ROOT/apps/chat" >/dev/null
CF="$(mktemp)"; chmod 600 "$CF"
python3 - "$CF" <<'PY'
import json, os, sys
e = os.environ
secrets = {"auth-secret": e["AUTH_SECRET"], "auth-users": e["AUTH_USERS"],
           "graph-auth-secret": e["GRAPH_AUTH_SECRET"], "database-url": e["DATABASE_URL"]}
env = [{"name": "AUTH_SECRET", "secretRef": "auth-secret"},
       {"name": "AUTH_USERS", "secretRef": "auth-users"},
       {"name": "GRAPH_AUTH_SECRET", "secretRef": "graph-auth-secret"},
       {"name": "DATABASE_URL", "secretRef": "database-url"},
       {"name": "AUTH_TRUST_HOST", "value": "true"}]
json.dump({"$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {"secretValues": {"value": secrets}, "env": {"value": env}}}, open(sys.argv[1], "w"))
PY
CHAT_FQDN="$(az deployment group create -g "$RG" -f "$ROOT/infra/app.bicep" -p "@$CF" \
  -p appName=chat image="$LOGIN/chat:$TAG" targetPort=8080 acrLoginServer="$LOGIN" \
     minReplicas=1 maxReplicas=3 cpu=0.5 memory=1Gi \
  --query properties.outputs.fqdn.value -o tsv)"
rm -f "$CF"

echo "https://$CHAT_FQDN"
