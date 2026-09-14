import { z } from "zod";
import type { Prisma } from "@prisma/client";
import db from "../../infra/db.js";
import { appConfig } from "../../config/app.js";
import { assertGameBelongsToTenant } from "../../lib/contentTenant.js";
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { canReadGame } from "./inspection.policy.js";
import type { GameViewer } from "../../types/game.js";

const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const booleanQuery = z.enum(["true", "false"]).default("false").transform(value => value === "true");
export const clientGameQuery = z.object({
  gameId: id.optional(),
  pageVersion: z.enum(["JAM", "POST_JAM"]).default("JAM"),
});
export const clientAchievementsQuery = clientGameQuery.extend({ owned: booleanQuery });
export const clientScoresQuery = z.object({
  leaderboardId: id,
  mine: booleanQuery,
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export type ClientActor = {
  user?: GameViewer & { id: number };
  tokenGameId?: number;
  tenantId?: string | null;
};

async function loadClientGame(gameId: number | undefined, actor: ClientActor) {
  const resolvedId = gameId ?? actor.tokenGameId;
  if (!resolvedId) throw new BadRequestError("gameId is required without a game-scoped token.");
  if (actor.tokenGameId !== undefined && actor.tokenGameId !== resolvedId) {
    throw new ForbiddenError("This game token is not authorized for this game.");
  }
  await assertGameBelongsToTenant(resolvedId, actor.tenantId);
  const game = await db.game.findUnique({
    where: { id: resolvedId },
    select: { id: true, slug: true, published: true, team: { select: { users: { select: { id: true } } } } },
  });
  if (!game || !canReadGame(game, actor.user)) throw new NotFoundError("Game not found.");
  return game;
}

async function loadClientPage(query: z.infer<typeof clientGameQuery>, actor: ClientActor) {
  const game = await loadClientGame(query.gameId, actor);
  const page = await db.gamePage.findFirst({
    where: { gameId: game.id, version: query.pageVersion },
    select: { id: true, name: true, version: true },
  });
  if (!page) throw new NotFoundError("Game page not found.");
  return { game, page };
}

export const clientUserSelect = { id: true, slug: true, name: true, profilePicture: true } as const;
const leaderboardSelect = {
  id: true, name: true, type: true, decimalPlaces: true, onlyBest: true, maxUsersShown: true,
} as const;

export async function getClientGame(query: z.infer<typeof clientGameQuery>, actor: ClientActor) {
  const { game, page } = await loadClientPage(query, actor);
  const [user, leaderboards] = await Promise.all([
    actor.user ? db.user.findUnique({ where: { id: actor.user.id }, select: clientUserSelect }) : Promise.resolve(null),
    db.gamePageLeaderboard.findMany({
      where: { gamePageId: page.id }, select: leaderboardSelect,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);
  return { user, game: { id: game.id, slug: game.slug, name: page.name, pageVersion: page.version }, leaderboards };
}

export async function getClientAchievements(query: z.infer<typeof clientAchievementsQuery>, actor: ClientActor) {
  if (query.owned && !actor.user) throw new UnauthorizedError("Sign in to view your achievements.");
  const { game, page } = await loadClientPage(query, actor);
  if (!actor.user) {
    const achievements = await db.gamePageAchievement.findMany({
      where: { gamePageId: page.id },
      select: { id: true, name: true, description: true, image: true },
      orderBy: { id: "asc" },
    });
    return { gameId: game.id, pageVersion: page.version, achievements };
  }
  const ownership = { OR: [
    { users: { some: { id: actor.user.id } } },
    { unlocks: { some: { userId: actor.user.id } } },
  ] };
  const achievements = await db.gamePageAchievement.findMany({
    where: { gamePageId: page.id, ...(query.owned ? ownership : {}) },
    select: {
      id: true, name: true, description: true, image: true,
      users: { where: { id: actor.user.id }, select: { id: true } },
      unlocks: { where: { userId: actor.user.id }, select: { earnedAt: true } },
    },
    orderBy: { id: "asc" },
  });
  return {
    gameId: game.id, pageVersion: page.version,
    achievements: achievements.map(({ users, unlocks, ...achievement }) => ({
      ...achievement, owned: users.length > 0 || unlocks.length > 0, earnedAt: unlocks[0]?.earnedAt ?? null,
    })),
  };
}

export async function getClientScores(query: z.infer<typeof clientScoresQuery>, actor: ClientActor) {
  if (query.mine && !actor.user) throw new UnauthorizedError("Sign in to view your scores.");
  const leaderboard = await db.gamePageLeaderboard.findUnique({
    where: { id: query.leaderboardId },
    select: { ...leaderboardSelect, gamePage: { select: { gameId: true, version: true } } },
  });
  if (!leaderboard) throw new NotFoundError("Leaderboard not found.");
  await loadClientGame(leaderboard.gamePage.gameId, actor);
  const userWhere: Prisma.UserWhereInput = !actor.tenantId ? {} :
    appConfig.platform.multiTenant.strictIsolation ? { tenantId: actor.tenantId } :
      { OR: [{ tenantId: actor.tenantId }, { tenantId: null }] };
  const where: Prisma.ScoreWhereInput = {
    leaderboardId: leaderboard.id, user: userWhere,
    ...(query.mine ? { userId: actor.user!.id } : {}),
  };
  const lowerBetter = leaderboard.type === "GOLF" || leaderboard.type === "SPEEDRUN";
  const direction = lowerBetter ? "asc" as const : "desc" as const;
  const divisor = leaderboard.type === "SCORE" || leaderboard.type === "GOLF" ? 10 ** leaderboard.decimalPlaces : 1;
  const userSelect = clientUserSelect;
  let entries: Array<{ data: number; user: { id: number; slug: string; name: string; profilePicture: string | null }; id?: number; createdAt?: Date; evidence?: string }>;
  if (leaderboard.onlyBest) {
    // Aggregate and paginate in the database, rather than loading every score to deduplicate.
    const groups = await db.score.groupBy({
      by: ["userId"], where, _min: { data: true }, _max: { data: true },
      orderBy: [lowerBetter ? { _min: { data: direction } } : { _max: { data: direction } }, { userId: "asc" }],
      skip: query.offset, take: query.limit + 1,
    });
    const users = await db.user.findMany({ where: { id: { in: groups.map(group => group.userId) } }, select: userSelect });
    const usersById = new Map(users.map(user => [user.id, user]));
    entries = groups.flatMap(group => {
      const user = usersById.get(group.userId);
      const data = lowerBetter ? group._min.data : group._max.data;
      return user && data !== null ? [{ data, user }] : [];
    });
  } else {
    entries = await db.score.findMany({
      where, select: { id: true, data: true, createdAt: true, evidence: true, user: { select: userSelect } },
      orderBy: [{ data: direction }, { userId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      skip: query.offset, take: query.limit + 1,
    });
  }
  const { gamePage, ...definition } = leaderboard;
  return {
    gameId: gamePage.gameId, pageVersion: gamePage.version, leaderboard: definition,
    scores: entries.slice(0, query.limit).map((entry, index) => ({
      ...entry, score: entry.data / divisor, position: query.offset + index + 1,
    })),
    offset: query.offset, limit: query.limit, mine: query.mine,
    nextOffset: entries.length > query.limit ? query.offset + query.limit : null,
  };
}
