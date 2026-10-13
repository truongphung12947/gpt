# Deploying to Azure Container Apps

Platform (resource group `$AZURE_RESOURCE_GROUP`, region `$AZURE_LOCATION`) is defined in `infra/main.bicep`:
ACR (`gptacr…`), Log Analytics, Container Apps environment `gpt-env`, and user-assigned identity `gpt-acr-pull`
(AcrPull on the registry was granted manually; the deploy principal is Contributor only and cannot create role assignments).

## Deploy an app
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
