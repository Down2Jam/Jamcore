import { z } from "zod";

import { appConfig } from "../../config/app.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

export const targetTeamInclude = {
  users: true,
  invites: true,
  applications: true,
  owner: {
    select: {
      id: true,
      slug: true,
      name: true,
    },
  },
  game: {
    include: {
      pages: {
        include: {
          achievements: true,
          leaderboards: {
            include: {
              scores: true,
            },
          },
        },
      },
    },
  },
} as const;

const targetTeamIdSchema = z.coerce.number().int().positive();

export type TargetTeamContext = Awaited<ReturnType<typeof loadTargetTeamById>>;

export function parseTargetTeamId(value: unknown) {
  const result = targetTeamIdSchema.safeParse(value);
  if (!result.success) {
    throw new BadRequestError("Team id missing.");
  }

  return result.data;
}

export async function loadTargetTeamById(teamId: number, tenantId?: string | null) {
  const team = await db.team.findUnique({
    where: {
      id: teamId,
    },
    include: targetTeamInclude,
  });

  if (!team) {
    throw new NotFoundError("Team missing.");
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Team",
    entityId: team.id,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Team missing.");
  }

  return team;
}

export async function loadTargetTeamContext(input: unknown) {
  if (input && typeof input === "object" && "teamId" in input) {
    const teamId = parseTargetTeamId(input.teamId);
    const tenantId =
      "tenantId" in input && typeof input.tenantId === "string"
        ? input.tenantId
        : null;
    return loadTargetTeamById(teamId, tenantId);
  }

  const teamId = parseTargetTeamId(input);
  return loadTargetTeamById(teamId);
}
