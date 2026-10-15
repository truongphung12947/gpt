# Deploying to Azure Container Apps

Platform (resource group `$AZURE_RESOURCE_GROUP`, region `$AZURE_LOCATION`) is defined in `infra/main.bicep`:
ACR (`gptacr…`), Log Analytics, Container Apps environment `gpt-env`, and user-assigned identity `gpt-acr-pull`
(AcrPull on the registry was granted manually; the deploy principal is Contributor only and cannot create role assignments).

## Standing rule: deploy after every code change
After every code change to `apps/` or `infra/`, run `scripts/deploy-all.sh`, verify the result (revisions healthy,
open the public URL and send a test message), and tell the user the chat URL printed by the script.
Authorised by the user for the `chat` and `graph` apps only; confirm before deploying anything else.

- `chat` (public, Next.js) proxies `/api/*` to `graph` (internal ingress only, LangGraph server) so the OpenAI key is never reachable directly.
- `graph` runs `langgraph dev` with one replica. Chats are durable in **Azure Database for PostgreSQL** (flexible server `gpt-pg-<hash>`, Burstable B1ms, PG16, created by `infra/postgres.bicep` on the first `deploy-all.sh`; connection string = secret `database-url` on both apps, backup in `~/.gpt-database-url`). The stock LangGraph Postgres server needs a LangChain license, so we do not use it. Instead: (1) messages and UI cards are LangGraph checkpoints in Postgres via a custom checkpointer (`apps/graph/checkpointer.py`, `checkpointer.path` in `langgraph.json`; falls back to memory without `DATABASE_URL`); (2) the chat list (owner, title, archived, updated_at) is the `chats` table, created on first use by `apps/chat/lib/db.ts` and served by `/api/chats` (`app/api/chats/**`, `lib/chats.ts`), which `lib/threadListAdapter.ts` uses; (3) the graph still keeps *thread records* in memory, so before any `/api/threads/<id>/…` request the proxy checks the chat belongs to the user in Postgres and recreates a missing record with `metadata.graph_id` (`ensureGraphThread` in `lib/graph.ts`), after which state/history/context come back from the checkpoints. Verified: restart + wiped `.langgraph_api` keeps list, titles, history and conversation context; other users get 404; deleting a chat also deletes its checkpoints. `/api/threads` create/search are blocked (use `/api/chats`). **Per-chat composer settings**: `chats.settings` (jsonb: `model`, `effort`, `webSearch`; column added by `lib/db.ts` on first use) is written through `PATCH /api/chats/<id>` and restored by `ChatSettingsSync` (`components/chat-settings-sync.tsx`, mounted inside the runtime provider): opening a chat applies its stored settings to the composer (`applySettings` in `model-context.tsx`, not saved as the browser default); changing model/thinking level/Search while a chat is open saves them to that chat (400 ms debounce); a chat with nothing stored adopts the current composer values. The browser's localStorage still supplies the default for a brand-new chat. Local testing: a leftover `apps/chat/.env.local` bakes `NEXT_PUBLIC_LANGGRAPH_API_URL` into the browser bundle; build with `NEXT_PUBLIC_LANGGRAPH_API_URL=` (the Docker image excludes `.env*`). Postgres allows Azure services via firewall rule `0.0.0.0` plus TLS and a random password; VNet integration would be stricter.
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
  max 5 MB each (text-like files only 1 MB: ~4 bytes/token, a 4.4 MB text file filled 94% of the context window). The model service reads them (verified on gpt-6-luna, gpt-6.1-sol and GLM-5.3-Flash); no text extraction on our side. Staged and sent files use the assistant-ui composer attachment chip (rejected files stay in the composer as a red chip with a short reason and a remove button; drag-and-drop uses `ComposerPrimitive.AttachmentDropzone`). Files are resent with every later turn.
  `experimental.proxyClientMaxBodySize` in `next.config.ts` is raised to 40mb because Next proxies the base64 body to the graph (default 10 MB).
- **Errors** use the assistant-ui Error state element. The runtime only attaches an error to a reply that has already started, so there are two banners: `MessageError` (in `claude.tsx`, inside `MessagePrimitive.Error`) for a failed reply, and
  `RunErrorBanner` (`components/run-error.tsx`) for failures with no reply (runtime `eventHandlers.onError`, plus request failures caught in the `stream` wrapper in `MyAssistant.tsx`, kind `transport`). Retry re-runs from the last user message
  (`startRun({parentId})`); for transport failures, where the server never saw the message, it sends the message again (the user bubble then appears twice). `getCheckpointId` in `MyAssistant.tsx` is what makes retry, Regenerate and Edit work at all.
  A GLM model fails (silently, before this banner existed) when sent an image: the banner hints to try another model.
- **Follow-up suggestions**: after each finished reply `SuggestionsSync` (`components/suggestions-sync.tsx`) POSTs the last exchange to the graph's `/suggestions` route (`webapp.py` → `followups.py`, one extra low-effort call on the selected model, 3 prompts),
  and passes them to the runtime's `suggestions` option; the assistant-ui `ThreadFollowupSuggestions` element shows them under the last reply, inside the scrolling content (not the sticky composer footer, where it covered the text while scrolling), and sends one on click. Not generated when merely reopening a thread.
- The chat has a model selector. The graph serves `GET /models` (custom route in `apps/graph/webapp.py`, proxied at `/api/models`) from LiteLLM's model list,
  optionally narrowed by `LITELLM_MODELS` (comma-separated). `/models` also returns each model's context window and reasoning support (from LiteLLM `/model/info`). The chosen model and thinking level (`low|medium|high`, only for reasoning models) are sent per run as `config.configurable.model` / `reasoning_effort` and validated server-side.
- **Sign-in and private chats** (email + password for now): Auth.js v5 Credentials provider in `apps/chat` (`auth.ts`, `lib/passwords.ts`, `proxy.ts` guards pages, `/signin` page, `UserMenu` sign-out). Users are the entries of the secret `AUTH_USERS` (`email:saltHex:hashHex,...`, scrypt); create an entry with `node scripts/hash-password.mjs <email>` (password prompted or `PASSWORD` env, min 10 chars). Unknown emails and wrong passwords both show "Wrong email or password". There is no self-service signup, reset or rate limiting.
  `/api/*` is no longer a Next rewrite: `app/api/[...path]/route.ts` checks the session and streams the request to the graph with an HMAC-signed bearer token (`lib/graphToken.ts`, secret `GRAPH_AUTH_SECRET` shared with the graph); owner id is the user's lower-cased email.
  The graph (`apps/graph/auth.py`, `langgraph.json` `auth`) verifies the token, stamps every thread with `metadata.owner` and filters every thread/run call by it (verified: other users get 404, forged/expired/missing token 401, owner cannot be overwritten). Assistants are shared.
  Custom routes (`/models`, `/suggestions`) are not covered by the graph auth; they are only reachable through the chat proxy because the graph has internal ingress only.
  `scripts/deploy-all.sh` refuses to deploy until `AUTH_USERS` resolves (env, else reused from the deployed chat app); `AUTH_SECRET` and `GRAPH_AUTH_SECRET` are generated once and stored as Container App secrets.
  **Planned for later: Microsoft Entra ID sign-in, allowlist only** (the user's choice; replace or add next to the Credentials provider in `auth.ts` with `next-auth/providers/microsoft-entra-id`). Needs an Entra app registration made by the user (redirect URI `https://<chat fqdn>/api/auth/callback/microsoft-entra-id`; the deploy principal cannot create it) and env `AUTH_MICROSOFT_ENTRA_ID_ID/_SECRET/_ISSUER` (`https://login.microsoftonline.com/<tenant>/v2.0`) plus `ALLOWED_EMAILS`; check the `signIn` callback against that list, and use the `oid` claim as owner id.
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

## assistant-ui conventions (audited against the element docs)
- Message branches: `BranchPicker` in both action rows; Edit swaps the bubble for `EditComposer` (`isEditing`), Regenerate/Edit make branches via `getCheckpointId`. `ThreadPrimitive.ScrollToBottom` sits in the viewport footer. Assistant action bar stays in the layout (opacity toggle, no content shift): invisible while the last reply streams, visible on the last reply, hover/focus for older ones; user bar is visible on touch (`hover:none`).
- Feedback buttons and Dictate only render when the runtime has the capability (`thread.capabilities.feedback/dictation`); neither adapter is configured today. The home screen has no mode chips (they did nothing).
- `StreamingPart` overrides the StreamingText demo defaults (`max-w-none min-h-0 whitespace-pre-wrap`, same text size as the final markdown) so nothing jumps when the part completes. Links in replies open in a new tab. Icon buttons carry `aria-label`s.
- The thread list adapter fetches all pages (cap 500) because the sidebar has no "load more". Archived chats are hidden and cannot be restored from the UI.
- `@assistant-ui/*` packages are pinned to exact versions (we use `unstable_*` runtime APIs). `apps/chat/lib/` was git-ignored by a Python `lib/` rule; `.gitignore` now un-ignores it, so those files are tracked.
