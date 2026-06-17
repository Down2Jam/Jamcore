import type { ServiceKeyIdentity } from "../auth/service.js";

export type PolicyName =
  | "platform.read"
  | "platform.write"
  | "events.consume"
  | "content.mutate"
  | "jam.participate"
  | "session.manage";

type UserLike = {
  admin?: boolean | null;
  mod?: boolean | null;
  id?: number | null;
};

type GrantLike = {
  role: string;
  resourceType?: string | null;
  resourceId?: string | null;
};

export function evaluatePolicy({
  grants,
  policy,
  service,
  user,
}: {
  grants?: GrantLike[] | null;
  policy: PolicyName;
  service?: ServiceKeyIdentity | null;
  user?: UserLike | null;
}) {
  const hasRole = (role: string) => (grants ?? []).some((grant) => grant.role === role);
  switch (policy) {
    case "platform.read":
      return Boolean(
        user?.admin ||
          hasRole("platform.reader") ||
          user?.mod ||
          service?.scopes.includes("*") ||
          service?.scopes.includes("audit:read") ||
          service?.scopes.includes("events:read") ||
          service?.scopes.includes("jobs:read") ||
          service?.scopes.includes("service-keys:read") ||
          service?.scopes.includes("webhooks:read"),
      );
    case "platform.write":
      return Boolean(
        user?.admin ||
          hasRole("platform.admin") ||
          service?.scopes.includes("*") ||
          service?.scopes.includes("service-keys:write") ||
          service?.scopes.includes("webhooks:write"),
      );
    case "events.consume":
      return Boolean(
        user?.admin ||
          hasRole("event.consumer") ||
          user?.mod ||
          service?.scopes.includes("*") ||
          service?.scopes.includes("events:read"),
      );
    case "content.mutate":
      return Boolean(
        user?.id ||
          hasRole("content.editor") ||
          service?.scopes.includes("*") ||
          service?.scopes.includes("posts:write"),
      );
    case "jam.participate":
    case "session.manage":
      return Boolean(user?.id);
    default:
      return false;
  }
}
