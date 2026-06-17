import type { ServiceKeyIdentity } from "../auth/service.js";

export type Permission =
  | "audit:read"
  | "events:read"
  | "exports:read"
  | "exports:secrets:read"
  | "federation:read"
  | "federation:write"
  | "games:read"
  | "imports:write"
  | "jams:write"
  | "jobs:read"
  | "jobs:write"
  | "moderation:read"
  | "moderation:write"
  | "openapi:read"
  | "posts:write"
  | "radio:write"
  | "reports:read"
  | "reports:write"
  | "restore:write"
  | "roles:write"
  | "search:read"
  | "search:write"
  | "service-keys:write"
  | "service-keys:read"
  | "users:read"
  | "webhooks:write"
  | "webhooks:read";

type UserLike = {
  admin?: boolean | null;
  mod?: boolean | null;
};

type GrantLike = {
  role: string;
};

const READ_PERMISSIONS = new Set<Permission>([
  "audit:read",
  "events:read",
  "exports:read",
  "federation:read",
  "games:read",
  "jobs:read",
  "moderation:read",
  "openapi:read",
  "reports:read",
  "search:read",
  "service-keys:read",
  "users:read",
  "webhooks:read",
]);

export function hasPermission({
  grants,
  permission,
  service,
  user,
}: {
  grants?: GrantLike[] | null;
  permission: Permission;
  service?: ServiceKeyIdentity | null;
  user?: UserLike | null;
}) {
  if (service) {
    return service.scopes.includes("*") || service.scopes.includes(permission);
  }

  if (user?.admin) {
    return true;
  }

  const roles = new Set((grants ?? []).map((grant) => grant.role));
  if (roles.has("platform.admin")) {
    return true;
  }

  if (roles.has("platform.reader") && READ_PERMISSIONS.has(permission)) {
    return true;
  }

  if (roles.has("event.consumer") && permission === "events:read") {
    return true;
  }

  if (roles.has("content.editor") && permission === "posts:write") {
    return true;
  }

  if (
    user?.mod &&
    (permission === "audit:read" ||
      permission === "events:read" ||
      permission === "exports:read" ||
      permission === "federation:read" ||
      permission === "federation:write" ||
      permission === "imports:write" ||
      permission === "jobs:read" ||
      permission === "moderation:read" ||
      permission === "moderation:write" ||
      permission === "radio:write" ||
      permission === "posts:write" ||
      permission === "reports:read" ||
      permission === "reports:write" ||
      permission === "restore:write" ||
      permission === "search:read" ||
      permission === "search:write" ||
      permission === "service-keys:write" ||
      permission === "webhooks:write" ||
      permission === "webhooks:read")
  ) {
    return true;
  }

  return false;
}
