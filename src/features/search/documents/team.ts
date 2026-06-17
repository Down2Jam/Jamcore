import db from "../../../infra/db.js";
import type { SearchDocumentRecord } from "../../../infra/searchStore.js";

export async function buildTeamSearchDocuments(input: {
  teamId: number;
  tenantId?: string | null;
}) {
  const team = await db.team.findUnique({
    where: { id: input.teamId },
    select: {
      id: true,
      name: true,
      description: true,
      owner: {
        select: {
          name: true,
        },
      },
      jam: {
        select: {
          name: true,
        },
      },
      rolesWanted: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!team) {
    return [];
  }

  return [
    {
      documentId: `team:${team.id}`,
      tenantId: input.tenantId ?? null,
      entityType: "team",
      entityId: team.id,
      variant: null,
      title: team.name ?? `Team ${team.id}`,
      subtitle: team.jam?.name ?? team.owner?.name ?? null,
      body: [team.description, team.owner?.name, team.rolesWanted.map((role) => role.name).join(" ")].filter(Boolean).join(" "),
      slug: null,
      tags: team.rolesWanted.map((role) => role.name),
      visibility: "public",
      metadata: {},
      sourceUpdatedAt: new Date().toISOString(),
      indexedAt: new Date().toISOString(),
    },
  ] satisfies SearchDocumentRecord[];
}
