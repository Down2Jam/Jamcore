import db from "../../../infra/db.js";
import type { SearchDocumentRecord } from "../../../infra/searchStore.js";

export async function buildUserSearchDocuments(input: {
  userId: number;
  tenantId?: string | null;
}) {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      slug: true,
      name: true,
      short: true,
      bio: true,
      pronouns: true,
      updatedAt: true,
      primaryRoles: {
        select: {
          name: true,
        },
      },
      secondaryRoles: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!user) {
    return [];
  }

  return [
    {
      documentId: `user:${user.id}`,
      tenantId: input.tenantId ?? null,
      entityType: "user",
      entityId: user.id,
      variant: null,
      title: user.name,
      subtitle: user.short ?? user.pronouns ?? null,
      body: [user.bio, user.pronouns].filter(Boolean).join(" "),
      slug: user.slug,
      tags: [
        ...user.primaryRoles.map((role) => role.name),
        ...user.secondaryRoles.map((role) => role.name),
      ],
      visibility: "public",
      metadata: {},
      sourceUpdatedAt: user.updatedAt.toISOString(),
      indexedAt: new Date().toISOString(),
    },
  ] satisfies SearchDocumentRecord[];
}
