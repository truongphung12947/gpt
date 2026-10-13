#!/usr/bin/env bash
# Deploys apps/graph (internal) then apps/chat (public) and prints the chat URL.
# Requires: az logged in, AZURE_RESOURCE_GROUP set.
# OPENAI_API_KEY comes from the environment or apps/graph/.env; when neither has it,
# an already-deployed graph keeps its stored secret and only the image is updated.
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

# --- graph (internal ingress, single replica: threads live in memory) ---
az acr build -r "$ACR" -t "graph:$TAG" "$ROOT/apps/graph" >/dev/null
GRAPH_IMAGE="$LOGIN/graph:$TAG"
if [ -n "${OPENAI_API_KEY:-}" ]; then
  PF="$(mktemp)"; trap 'rm -f "$PF"' EXIT; chmod 600 "$PF"
  python3 - "$PF" <<PY
import json, os, sys
json.dump({"\$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {"secretValues": {"value": {"openai-api-key": os.environ["OPENAI_API_KEY"]}}}},
  open(sys.argv[1], "w"))
PY
  GRAPH_FQDN="$(az deployment group create -g "$RG" -f "$ROOT/infra/app.bicep" -p "@$PF" \
    -p appName=graph image="$GRAPH_IMAGE" targetPort=2024 acrLoginServer="$LOGIN" \
       externalIngress=false minReplicas=1 maxReplicas=1 cpu=0.5 memory=1Gi \
       env='[{"name":"OPENAI_API_KEY","secretRef":"openai-api-key"}]' \
    --query properties.outputs.fqdn.value -o tsv)"
else
  az containerapp update -n graph -g "$RG" --image "$GRAPH_IMAGE" >/dev/null
  GRAPH_FQDN="$(az containerapp show -n graph -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
fi

# --- chat (public); the graph URL is baked into the Next.js rewrite at build time ---
az acr build -r "$ACR" -t "chat:$TAG" --build-arg "LANGGRAPH_INTERNAL_URL=https://$GRAPH_FQDN" "$ROOT/apps/chat" >/dev/null
CHAT_FQDN="$(az deployment group create -g "$RG" -f "$ROOT/infra/app.bicep" \
  -p appName=chat image="$LOGIN/chat:$TAG" targetPort=8080 acrLoginServer="$LOGIN" \
     minReplicas=1 maxReplicas=3 cpu=0.5 memory=1Gi \
  --query properties.outputs.fqdn.value -o tsv)"

echo "https://$CHAT_FQDN"
