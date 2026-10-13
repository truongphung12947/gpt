#!/usr/bin/env bash
# Usage: scripts/deploy.sh <app-name> <app-dir> [target-port]
# Builds apps/<dir> in ACR (no local Docker needed) and deploys it as a Container App.
# Requires: az logged in, AZURE_RESOURCE_GROUP set.
set -euo pipefail

APP="${1:?app name}"; DIR="${2:?app dir}"; PORT="${3:-8080}"
RG="${AZURE_RESOURCE_GROUP:?}"
ACR="$(az acr list -g "$RG" --query '[0].name' -o tsv)"
LOGIN="$(az acr show -n "$ACR" --query loginServer -o tsv)"
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="$LOGIN/$APP:$TAG"

az acr build -r "$ACR" -t "$APP:$TAG" "$DIR"
az deployment group create -g "$RG" -f "$(dirname "$0")/../infra/app.bicep" \
  -p appName="$APP" image="$IMAGE" targetPort="$PORT" acrLoginServer="$LOGIN" \
  --query properties.outputs.fqdn.value -o tsv
