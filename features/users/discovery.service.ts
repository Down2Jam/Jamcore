import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { listUserCards, searchUserCards } from "./discovery.queries.js";
import { listUsersQuerySchema } from "./discovery.schemas.js";

export async function listUsers(input: {
  cursor?: string;
  limit?: number;
  tenantId?: string | null;
} = {}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const users = await listUserCards({
    cursor: input.cursor,
    limit,
  });
  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "User",
    ids: users.map((user) => user.id),
    tenantId: input.tenantId,
  });
  const tenantUsers = users.filter((user) => allowedIds.includes(user.id));

  return {
    items: tenantUsers.slice(0, limit),
    pageInfo: {
      hasMore: tenantUsers.length > limit,
      nextCursor:
        tenantUsers.length > limit && tenantUsers[limit - 1]
          ? String(tenantUsers[limit - 1].id)
          : null,
      limit,
    },
  };
}

export async function searchUsers(query: string, tenantId?: string | null) {
  const users = await searchUserCards(query);
  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "User",
    ids: users.map((user) => user.id),
    tenantId,
  });
  return users.filter((user) => allowedIds.includes(user.id));
}

export { listUsersQuerySchema };
export { searchUsersQuerySchema } from "./discovery.schemas.js";
