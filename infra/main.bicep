// Shared platform: Log Analytics, Container Registry, Container Apps environment,
// and a user-assigned identity that apps use to pull images from the registry.
targetScope = 'resourceGroup'

@description('Short prefix for resource names')
param prefix string = 'gpt'
param location string = resourceGroup().location

var suffix = uniqueString(resourceGroup().id)
var acrName = toLower('${prefix}acr${suffix}')

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-acr-pull'
  location: location
}

// NOTE: grant AcrPull to the identity once, outside this template (the deploy
// principal only has Contributor, which cannot create role assignments):
//   az role assignment create --assignee-object-id <identity principalId> \
//     --assignee-principal-type ServicePrincipal --role AcrPull --scope <acr id>

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output environmentName string = env.name
output pullIdentityId string = pullIdentity.id
output pullIdentityPrincipalId string = pullIdentity.properties.principalId
output acrId string = acr.id
