// Azure Database for PostgreSQL Flexible Server for chat data (LangGraph checkpoints and the
// chats table). Smallest burstable size; TLS is required. Reachable from Azure services only
// (firewall rule 0.0.0.0) plus the password; move to VNet integration for stricter isolation.
targetScope = 'resourceGroup'

param serverName string
param location string = resourceGroup().location
param administratorLogin string = 'chatadmin'
@secure()
param administratorLoginPassword string
param databaseName string = 'chat'
param skuName string = 'Standard_B1ms'
param storageSizeGB int = 32

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: { storageSizeGB: storageSizeGB }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource db 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
}

resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output database string = db.name
output admin string = administratorLogin
