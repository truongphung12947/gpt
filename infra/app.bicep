// One Azure Container App in the shared environment, pulling from ACR with the shared identity.
targetScope = 'resourceGroup'

param appName string
param image string
param targetPort int = 8080
param externalIngress bool = true
param minReplicas int = 0
param maxReplicas int = 3
param cpu string = '0.25'
param memory string = '0.5Gi'
@description('Environment variables; use {name, secretRef} for values held in secretValues')
param env array = []
@secure()
@description('Container App secrets as { secret-name: value }; names are lowercase letters, digits and dashes')
param secretValues object = {}
param location string = resourceGroup().location
param environmentName string = 'gpt-env'
param pullIdentityName string = 'gpt-acr-pull'
param acrLoginServer string

resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: pullIdentityName
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${pullIdentity.id}': {} }
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: externalIngress
        targetPort: targetPort
        transport: 'auto'
      }
      secrets: [for s in items(secretValues): {
        name: s.key
        value: s.value
      }]
      registries: [
        {
          server: acrLoginServer
          identity: pullIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: image
          env: env
          resources: {
            cpu: json(cpu)
            memory: memory
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
