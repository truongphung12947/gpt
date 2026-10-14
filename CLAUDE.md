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
- The graph **always uses the OpenAI Responses API** (`use_responses_api=True`, `output_version="responses/v1"`), by the user's decision. Reasoning models get
  `reasoning={"effort": <low|medium|high>, "summary": "detailed"}` so the UI can show the model's reasoning summary (`detailed` was reliable; `auto` sometimes returned none).
  Easy questions legitimately produce no summary. The chat renders reasoning with the assistant-ui Reasoning element.
- **Web search** is opt-in per message: the composer's "Search" switch (off by default, remembered in the browser, disabled for models without `supports_web_search`) sends `config.configurable.web_search=true`; the graph then binds the Responses API built-in `web_search` tool with `tool_choice` forced, so every message sent while it is on is answered with a search. The runtime drops `web_search_call` blocks and
  text annotations, so `apps/graph/agent.py` reports the search as a LangGraph custom UI message (`push_ui_message("web_search", ...)`, state key `ui`, attached to the reply by
  message id: first `searching` with queries, then `done` with cited sources). The chat renders it with the assistant-ui Web search element (`WebSearchCard` in `claude.tsx`);
  `load` in `MyAssistant.tsx` returns `ui` so the card survives reloading a thread. Every chunk of one model call shares one message id (`ChatOpenAIStableId`), which this depends on.
- **File attachments** (`apps/chat/lib/attachmentAdapter.ts`, passed as `adapters.attachments` to the LangGraph runtime) attach the file itself to the message as base64 (native attach, by the user's decision): PDF, `.docx`, text, Markdown, CSV, JSON and images,
  max 5 MB each (text-like files only 1 MB: ~4 bytes/token, a 4.4 MB text file filled 94% of the context window). The model service reads them (verified on gpt-6-luna, gpt-6.1-sol and GLM-5.3-Flash); no text extraction on our side. Rejected files stay in the composer with an error tile. Files are resent with every later turn.
  `experimental.proxyClientMaxBodySize` in `next.config.ts` is raised to 40mb because Next proxies the base64 body to the graph (default 10 MB).
- The chat has a model selector. The graph serves `GET /models` (custom route in `apps/graph/webapp.py`, proxied at `/api/models`) from LiteLLM's model list,
  optionally narrowed by `LITELLM_MODELS` (comma-separated). `/models` also returns each model's context window and reasoning support (from LiteLLM `/model/info`). The chosen model and thinking level (`low|medium|high`, only for reasoning models) are sent per run as `config.configurable.model` / `reasoning_effort` and validated server-side.
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
