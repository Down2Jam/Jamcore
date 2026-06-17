import { appConfig } from "./app.js";

export function resolveTenantConfig(host?: string | null) {
  const normalizedHost = host?.split(":")[0]?.toLowerCase() ?? null;
  const tenant =
    appConfig.platform.multiTenant.tenants.find((entry) =>
      normalizedHost ? entry.hosts.map((value) => value.toLowerCase()).includes(normalizedHost) : false,
    ) ??
    appConfig.platform.multiTenant.tenants.find(
      (entry) => entry.id === appConfig.platform.multiTenant.defaultTenantId,
    ) ??
    null;

  return {
    id: tenant?.id ?? appConfig.platform.multiTenant.defaultTenantId,
    appName: tenant?.appName ?? appConfig.appName,
    publicOrigin: tenant?.publicOrigin ?? appConfig.publicOrigin,
    mentionDomains: tenant?.mentionDomains ?? appConfig.mentionDomains,
  };
}
