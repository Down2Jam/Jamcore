import { PageVersion } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { buildJamTimeline, getJamPhase } from "../../domain/jamTimeline.js";
import {
  getFallbackJamPhase,
  getNextJamAfter,
  hasJoinedJam,
  shouldTreatJamAsUpcoming,
  sortJamsByStartTime,
} from "../../domain/jamPolicies.js";
import { TTLCache } from "../../lib/cache.js";
import { invalidatePublicReadCaches } from "../../lib/cacheInvalidation.js";
import { emitDomainEvent } from "../../lib/domainEvents.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";
import { writeAuditEntry } from "../../infra/audit.js";

type RecentJam = {
  id: number;
  slug: string;
  startTime: Date | string;
};

type ActiveJamSummary = {
  id: number;
  slug: string;
  startTime: Date | string;
  themePerUser?: number;
  users: Array<{ id: number; slug: string }>;
  games: any[];
};

type ActiveJamResult =
  | {
      phase: string;
      jam: ActiveJamSummary;
      nextJam?: ActiveJamSummary | null;
    }
  | {
      phase: string;
      jam?: undefined;
      nextJam?: undefined;
    };

const activeJamCache = new TTLCache<ActiveJamResult>(15_000);
const jamListCache = new TTLCache<RecentJam[]>(60_000);
const ACTIVE_JAM_CACHE_KEY = "active-jam";
const JAM_LIST_CACHE_KEY = "list-jams";

const activeJamSummaryInclude = {
  users: {
    select: {
      id: true,
      slug: true,
    },
  },
  games: {
    select: {
      id: true,
      jamId: true,
      category: true,
      published: true,
      ratingCategories: {
        select: {
          id: true,
        },
      },
      ratings: {
        select: {
          id: true,
        },
      },
      pages: {
        where: {
          version: PageVersion.JAM,
        },
        select: {
          version: true,
          tracks: {
            select: {
              id: true,
              ratings: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function userIsInJam(
  user: { id: number },
  jam: { users: Array<{ id: number }> },
) {
  return jam.users.some((jamUser) => user.id === jamUser.id);
}

export function clearJamServiceCaches() {
  activeJamCache.clear();
  jamListCache.clear();
}

function normalizeJamGames<T extends { games?: any[] }>(jam: T): T {
  return {
    ...jam,
    games: (jam.games ?? []).map((game: any) => {
      const jamPage =
        game.pages?.find((page: any) => page.version === PageVersion.JAM) ??
        null;

      return {
        ...game,
        tracks: jamPage?.tracks ?? [],
      };
    }),
  };
}

function tenantCacheKey(base: string, tenantId?: string | null) {
  return JSON.stringify({
    key: base,
    tenantId: tenantId ?? null,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
}

export async function listJams(tenantId?: string | null): Promise<RecentJam[]> {
  return jamListCache.getOrSet(tenantCacheKey(JAM_LIST_CACHE_KEY, tenantId), async () => {
    const jams = await db.jam.findMany({
      take: tenantId ? 50 : 10,
      orderBy: { id: "desc" },
    });

    const allowedJamIds = new Set(
      await filterCoreEntityIdsByTenant({
        entityType: "Jam",
        ids: jams.map((jam) => jam.id),
        tenantId,
        strictIsolation: appConfig.platform.multiTenant.strictIsolation,
      }),
    );
    const now = Date.now();

    return jams
      .filter((jam) => allowedJamIds.has(jam.id))
      .filter((jam) => {
        const jamEnd = new Date(jam.startTime).getTime();
        return jamEnd < now;
      })
      .slice(0, 10);
  });
}

export async function getRandomJam(tenantId?: string | null) {
  const jam = await db.$queryRaw<{ id: number; slug: string; name: string }[]>`
    SELECT j.id, j.slug, j.name
    FROM "Jam" j
    ORDER BY RANDOM()
    LIMIT 1
  `;

  if (!jam[0]) {
    return null;
  }

  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "Jam",
    ids: [jam[0].id],
    tenantId,
  });

  return allowedIds.includes(jam[0].id) ? jam[0] : null;
}

export async function resolveJamReference({
  jamId,
  jamSlug,
}: {
  jamId?: number | string | null | undefined;
  jamSlug?: string | null | undefined;
}) {
  const normalizedSlug =
    typeof jamSlug === "string" && jamSlug.trim().length > 0
      ? jamSlug.trim()
      : null;

  if (normalizedSlug) {
    return db.jam.findUnique({
      where: { slug: normalizedSlug },
      select: {
        id: true,
        slug: true,
      },
    });
  }

  const normalizedId =
    typeof jamId === "number"
      ? jamId
      : typeof jamId === "string" && jamId.trim().length > 0
        ? Number.parseInt(jamId, 10)
        : null;

  if (!normalizedId || Number.isNaN(normalizedId)) {
    return null;
  }

  return db.jam.findUnique({
    where: { id: normalizedId },
    select: {
      id: true,
      slug: true,
    },
  });
}

export async function hasUserJoinedJam({
  jamId,
  userSlug,
}: {
  jamId: number;
  userSlug: string;
}) {
  const match = await db.jam.findFirst({
    where: {
      id: jamId,
      users: {
        some: {
          slug: userSlug,
        },
      },
    },
  });

  return Boolean(match);
}

export async function joinJam({
  jamId,
  userId,
  alreadyJoined,
}: {
  jamId: number;
  userId: number;
  alreadyJoined: boolean;
}) {
  if (alreadyJoined) {
    throw new ConflictError("You already joined this jam");
  }

  await db.jam.update({
    where: {
      id: jamId,
    },
    data: {
      users: {
        connect: {
          id: userId,
        },
      },
    },
  });

  invalidatePublicReadCaches("jam");
  await writeAuditEntry({
    action: "jam.join",
    actor: {
      id: userId,
      type: "user",
    },
    resource: `jam:${jamId}`,
  });
  await emitDomainEvent({
    type: "jam.joined",
    payload: {
      jamId,
      userId,
    },
  });
}

export async function getCurrentActiveJam(tenantId?: string | null): Promise<ActiveJamResult> {
  return activeJamCache.getOrSet(tenantCacheKey(ACTIVE_JAM_CACHE_KEY, tenantId), async () => {
    const jams = await db.jam.findMany({
      where: { isActive: true },
      include: activeJamSummaryInclude,
    });

    const allowedJamIds = await filterCoreEntityIdsByTenant({
      entityType: "Jam",
      ids: jams.map((jam) => jam.id),
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    });
    const normalizedJams = jams
      .filter((jam) => allowedJamIds.includes(jam.id))
      .map(normalizeJamGames);
    const sortedJams = sortJamsByStartTime(normalizedJams);

    const now = new Date().toISOString();
    let upcomingJam: ActiveJamSummary | null = null;

    for (const jam of sortedJams) {
      const timeline = buildJamTimeline(jam);
      const phase = getJamPhase(jam, now);

      if (
        shouldTreatJamAsUpcoming({
          now,
          postJamRatingEnd: timeline.postJamRatingEnd,
        })
      ) {
        if (!upcomingJam) {
          upcomingJam = jam;
        }
      }

      if (phase) {
        return { phase, jam, nextJam: getNextJamAfter(sortedJams, jam.id) };
      }
    }

    if (upcomingJam) {
      return {
        phase: getFallbackJamPhase(true),
        jam: upcomingJam,
        nextJam: getNextJamAfter(sortedJams, upcomingJam.id),
      };
    }

    return { phase: getFallbackJamPhase(false) };
  });
}

export async function checkJamParticipation(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const userSlug = res.locals.userSlug;
  const activeJam = await getCurrentActiveJam(res.locals.tenantId);

  if (!activeJam?.jam) {
    next(new NotFoundError("No active jam found."));
    return;
  }

  const jamWithUsers = await db.jam.findUnique({
    where: { id: activeJam.jam.id },
    select: {
      users: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!hasJoinedJam({ userSlug, jamUsers: jamWithUsers?.users })) {
    next(new ForbiddenError("You must join the jam first to participate."));
    return;
  }

  next();
}
