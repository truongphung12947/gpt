# Deploying to Azure Container Apps

Platform (resource group `$AZURE_RESOURCE_GROUP`, region `$AZURE_LOCATION`) is defined in `infra/main.bicep`:
ACR (`gptacr…`), Log Analytics, Container Apps environment `gpt-env`, and user-assigned identity `gpt-acr-pull`
(AcrPull on the registry was granted manually; the deploy principal is Contributor only and cannot create role assignments).

## Standing rule: deploy after every code change
After every code change to `apps/` or `infra/`, run `scripts/deploy-all.sh`, verify the result (revisions healthy,
open the public URL and send a test message), and tell the user the chat URL printed by the script.
Authorised by the user for the `chat` and `graph` apps only; confirm before deploying anything else.

- `chat` (public, Next.js) proxies `/api/*` to `graph` (internal ingress only, LangGraph server) so the OpenAI key is never reachable directly.
- `graph` runs `langgraph dev` with one replica: threads are in memory and are lost on restart. Persistent storage would need a Postgres-backed LangGraph deployment.
- The graph's model comes from a LiteLLM proxy when `LITELLM_BASE_URL` is set (HTTPS: `https://mylitellm.eastus2.cloudapp.azure.com`, model `gpt-6.1-sol`),
  otherwise from OpenAI. Deploy with `LITELLM_BASE_URL`, `LITELLM_MODEL` and a key set; the key is stored as the Container App secret `litellm-api-key`.
  The user chose to deploy the LiteLLM **admin key** (`LITELLM_ALLOW_ADMIN_KEY=1`); a limited virtual key in `LITELLM_API_KEY` is the safer option and takes priority if set.
- `OPENAI_API_KEY` is stored as the Container App secret `openai-api-key`. It is read from the env or `apps/graph/.env` (gitignored); with neither, the script only updates the graph image and keeps the stored secret.

## Deploy a single app
    scripts/deploy.sh <app-name> <app-dir> [port]
Builds with `az acr build` (no local Docker) and deploys `infra/app.bicep` (scale-to-zero, external ingress by default;
override via `-p` params such as `minReplicas`, `externalIngress`, `env`). Prints the app FQDN. Example app: `apps/hello`.

## Session setup
Credentials come from env vars `AZURE_CLIENT_ID/CLIENT_SECRET/TENANT_ID/SUBSCRIPTION_ID/RESOURCE_GROUP/LOCATION`.
If `az` is missing: `curl -sL https://aka.ms/InstallAzureCLIDeb | bash`, `az extension add --name containerapp -y`,
then `az login --service-principal -u $AZURE_CLIENT_ID -p $AZURE_CLIENT_SECRET --tenant $AZURE_TENANT_ID`.
The ~120 MB Bicep download can be cut off by the proxy; if so, `rm ~/.azure/bin/bicep && az bicep install`.

## Rules
- Never print or commit secrets. Put app secrets in Container Apps secrets / Key Vault, not in Bicep params files.
- Confirm before deleting resources or deploying anything beyond the shared platform and the requested app.
