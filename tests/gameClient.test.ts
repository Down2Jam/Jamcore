import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, tenantCheck } = vi.hoisted(() => ({
  dbMock: {
    game: { findUnique: vi.fn() }, gamePage: { findFirst: vi.fn() },
    gamePageLeaderboard: { findUnique: vi.fn(), findMany: vi.fn() },
    gamePageAchievement: { findMany: vi.fn() },
    score: { findMany: vi.fn(), groupBy: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
  },
  tenantCheck: vi.fn(),
}));
vi.mock("../src/infra/db.js", () => ({ default: dbMock }));
vi.mock("../src/lib/contentTenant.js", () => ({ assertGameBelongsToTenant: tenantCheck }));
vi.mock("../src/infra/rateLimitStore.js", () => ({ incrementRateLimit: async () => ({ count: 1, resetMs: 60000 }) }));
vi.mock("../src/auth/session.js", () => ({ authenticateRequest: async (req: express.Request, res: express.Response, optional = false) => {
  if (!req.get("Authorization")) { if (optional) return null; throw new UnauthorizedError(); }
  res.locals.authMethod = "gameToken";
  res.locals.gameAccessTokenGameId = 7;
  return "player";
} }));
vi.mock("../src/loaders/getUserOptional.js", () => ({ default: (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.locals.userSlug) res.locals.user = { id: 3, slug: "player", name: "Player" } as typeof res.locals.user;
  next();
} }));
import { ApiError, NotFoundError, UnauthorizedError } from "../src/lib/errors.js";
import {
  clientGameQuery, clientAchievementsQuery, clientScoresQuery,
  getClientGame, getClientAchievements, getClientScores,
} from "../src/features/games/client.service.js";
import { createApiCors } from "../src/middleware/apiCors.js";
import { createPlayerReadsRouter } from "../src/features/games/player.router.js";

import { ZodError } from "zod";

vi.mock("../src/loaders/getUser.js", () => ({ default: (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.locals.userSlug) res.locals.user = { id: 3, slug: "player", name: "Player" } as typeof res.locals.user;
  next();
} }));
const user = { id: 3, slug: "player", name: "Player", profilePicture: null };
const actor = { user, tokenGameId: 7, tenantId: "tenant-a" };
const board = { id: 9, name: "Best", type: "SCORE", decimalPlaces: 2, onlyBest: true, maxUsersShown: 10, gamePage: { gameId: 7, version: "JAM" } };
beforeEach(() => {
  vi.resetAllMocks();
  tenantCheck.mockResolvedValue(undefined);
  dbMock.game.findUnique.mockResolvedValue({ id: 7, slug: "game", published: true, team: null });
  dbMock.gamePage.findFirst.mockResolvedValue({ id: 8, name: "Game", version: "JAM" });
  dbMock.user.findUnique.mockResolvedValue(user);
  dbMock.user.findMany.mockResolvedValue([user]);
  dbMock.gamePageLeaderboard.findMany.mockResolvedValue([]);
  dbMock.gamePageLeaderboard.findUnique.mockResolvedValue(board);
  dbMock.gamePageAchievement.findMany.mockResolvedValue([]);
  dbMock.score.groupBy.mockResolvedValue([]);
  dbMock.score.findMany.mockResolvedValue([]);
});

describe("game client reads", () => {
  it("infers the game from the token and exposes only the player summary and board definitions", async () => {
    expect(await getClientGame(clientGameQuery.parse({}), actor)).toEqual({ user, game: { id: 7, slug: "game", name: "Game", pageVersion: "JAM" }, leaderboards: [] });
    expect(tenantCheck).toHaveBeenCalledWith(7, "tenant-a");
    expect(dbMock.user.findUnique).toHaveBeenCalledWith({ where: { id: 3 }, select: { id: true, slug: true, name: true, profilePicture: true } });
  });
  it("rejects a different game before reading it", async () => {
    await expect(getClientGame(clientGameQuery.parse({ gameId: 99 }), actor)).rejects.toMatchObject({ statusCode: 403 });
    expect(dbMock.game.findUnique).not.toHaveBeenCalled();
  });
  it("requires a game for session requests", async () => {
    await expect(getClientGame(clientGameQuery.parse({}), { user })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("rejects another tenant and hidden games", async () => {
    tenantCheck.mockRejectedValueOnce(new NotFoundError());
    await expect(getClientGame(clientGameQuery.parse({}), actor)).rejects.toMatchObject({ statusCode: 404 });
    expect(dbMock.game.findUnique).not.toHaveBeenCalled();
    dbMock.game.findUnique.mockResolvedValue({ id: 7, published: false, team: { users: [] } });
    await expect(getClientGame(clientGameQuery.parse({}), actor)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("selects the requested version without silently falling back", async () => {
    dbMock.gamePage.findFirst.mockResolvedValue(null);
    await expect(getClientAchievements(clientAchievementsQuery.parse({ pageVersion: "POST_JAM" }), actor)).rejects.toMatchObject({ statusCode: 404 });
    expect(dbMock.gamePage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { gameId: 7, version: "POST_JAM" } }));
  });
  it("returns owned and locked achievements, including legacy ownership without a timestamp", async () => {
    const earnedAt = new Date("2026-09-01");
    dbMock.gamePageAchievement.findMany.mockResolvedValue([
      { id: 1, users: [], unlocks: [{ earnedAt }] },
      { id: 2, users: [{ id: 3 }], unlocks: [] },
      { id: 3, users: [], unlocks: [] },
    ]);
    const result = await getClientAchievements(clientAchievementsQuery.parse({}), actor);
    expect(result.achievements).toEqual([{ id: 1, owned: true, earnedAt }, { id: 2, owned: true, earnedAt: null }, { id: 3, owned: false, earnedAt: null }]);
    expect(dbMock.gamePageAchievement.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ users: { where: { id: 3 }, select: { id: true } }, unlocks: { where: { userId: 3 }, select: { earnedAt: true } } }) }));
  });
  it("filters owned achievements by the authenticated player", async () => {
    await getClientAchievements(clientAchievementsQuery.parse({ owned: "true" }), actor);
    expect(dbMock.gamePageAchievement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { gamePageId: 8, OR: [{ users: { some: { id: 3 } } }, { unlocks: { some: { userId: 3 } } }] } }));
  });
  it("rejects leaderboards belonging to another game", async () => {
    dbMock.gamePageLeaderboard.findUnique.mockResolvedValue({ ...board, gamePage: { gameId: 99 } });
    await expect(getClientScores(clientScoresQuery.parse({ leaderboardId: 9 }), actor)).rejects.toMatchObject({ statusCode: 403 });
    expect(dbMock.score.groupBy).not.toHaveBeenCalled();
  });
  it.each(["SCORE", "GOLF", "SPEEDRUN", "ENDURANCE"])("orders and scales %s scores", async type => {
    dbMock.gamePageLeaderboard.findUnique.mockResolvedValue({ ...board, type });
    dbMock.score.groupBy.mockResolvedValue([{ userId: 3, _min: { data: 123 }, _max: { data: 456 } }]);
    const lower = type === "GOLF" || type === "SPEEDRUN";
    const result = await getClientScores(clientScoresQuery.parse({ leaderboardId: 9 }), actor);
    expect(result.scores[0].score).toBe((lower ? 123 : 456) / (["SCORE", "GOLF"].includes(type) ? 100 : 1));
    expect(dbMock.score.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ["userId"], orderBy: [lower ? { _min: { data: "asc" } } : { _max: { data: "desc" } }, { userId: "asc" }] }));
  });
  it("paginates individual entries and filters personal scores without accepting another user id", async () => {
    dbMock.gamePageLeaderboard.findUnique.mockResolvedValue({ ...board, onlyBest: false });
    dbMock.score.findMany.mockResolvedValue([{ id: 1, data: 456, user }, { id: 2, data: 123, user }]);
    const result = await getClientScores(clientScoresQuery.parse({ leaderboardId: 9, mine: "true", userId: 99, limit: 1, offset: 2 }), actor);
    expect(result.nextOffset).toBe(3);
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0]).toMatchObject({ id: 1, score: 4.56, position: 3 });
    expect(dbMock.score.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ leaderboardId: 9, userId: 3, user: expect.any(Object) }), skip: 2, take: 2 }));
  });
  it.each([{ leaderboardId: "x" }, { leaderboardId: 1, limit: 101 }, { leaderboardId: 1, offset: -1 }, { leaderboardId: 1, mine: "yes" }])("rejects malformed score queries %j", query => {
    expect(clientScoresQuery.safeParse(query).success).toBe(false);
  });
});

describe("registered player reads", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(createApiCors("https://d2jam.com"));
    app.use("/api/v1", createPlayerReadsRouter());
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(error instanceof ApiError ? error.statusCode : error instanceof ZodError ? 400 : 500).json({ error: error.message });
    });
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const address = server.address() as AddressInfo;
    base = "http://127.0.0.1:" + address.port + "/api/v1";
  });
  afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  it.each(["/self/game-context", "/self/achievements", "/self/scores?leaderboardId=9"])("serves player-only reads: %s", async path => {
    const response = await fetch(base + path, { headers: { Origin: "null", Authorization: "Bearer game-token" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it.each(["/self/game-context", "/self/achievements", "/self/scores?leaderboardId=9"])("requires login for %s", async path => {
    const response = await fetch(base + path);
    expect(response.status).toBe(401);
  });
  it.each(["/games/game/leaderboards", "/games/game/achievements", "/leaderboards/9/scores"])("serves public data without credentials: %s", async path => {
    const response = await fetch(base + path, { headers: { Origin: "https://example.com" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
  it("protects private games and game scope", async () => {
    dbMock.game.findUnique.mockResolvedValue({ id: 7, published: false, team: null });
    expect((await fetch(base + "/leaderboards/9/scores")).status).toBe(404);
    dbMock.game.findUnique.mockResolvedValue({ id: 99, published: true, team: null });
    expect((await fetch(base + "/games/other/leaderboards", { headers: { Authorization: "Bearer game-token" } })).status).toBe(403);
  });
  it("keeps player ownership out of public definitions and ignores public mine filters", async () => {
    dbMock.gamePageAchievement.findMany.mockResolvedValue([{ id: 1, name: "Winner", users: [{ id: 3 }], unlocks: [] }]);
    const response = await fetch(base + "/games/game/achievements?owned=true", { headers: { Authorization: "Bearer game-token" } });
    const body = await response.json();
    expect(body.achievements[0]).not.toHaveProperty("owned");
    expect(body.achievements[0]).not.toHaveProperty("users");
    expect((await fetch(base + "/leaderboards/9/scores?mine=true")).status).toBe(200);
    expect(dbMock.score.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ userId: expect.anything() }) }));
  });
  it("has no unreleased game-client aliases", async () => {
    expect((await fetch(base + "/game-client")).status).toBe(404);
  });
});
