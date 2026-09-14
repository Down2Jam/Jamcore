import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Explicit opt-in: use only a disposable database with migrations applied.
const testUrl = process.env.TOKEN_TEST_DATABASE_URL;
vi.mock("../src/infra/rateLimitStore.js", () => ({ incrementRateLimit: async () => ({ count: 1, resetMs: 60000 }) }));

describe.skipIf(!testUrl)("game authorization on PostgreSQL", () => {
  let db: typeof import("../src/infra/db.js").default;
  let store: typeof import("../src/auth/gameTokenStore.js");
  let server: Server;
  let base: string;
  let userId: number, gameId: number, jamId: number, teamId: number, pageId: number, achievementId: number, leaderboardId: number;
  let websiteToken: string;
  const slug = `game-flow-${crypto.randomUUID()}`;
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl!;
    db = (await import("../src/infra/db.js")).default;
    store = await import("../src/auth/gameTokenStore.js");
    const user = await db.user.create({ data: { slug, name: "Game flow fixture", password: "fixture-only", admin: true, mod: true } });
    userId = user.id;
    jamId = (await db.jam.create({ data: { slug, name: "Fixture jam" } })).id;
    teamId = (await db.team.create({ data: { ownerId: userId, jamId } })).id;
    gameId = (await db.game.create({ data: { slug, category: "REGULAR", teamId, jamId, published: true } })).id;
    pageId = (await db.gamePage.create({ data: { gameId, version: "JAM", name: "Fixture game" } })).id;
    achievementId = (await db.gamePageAchievement.create({ data: { gamePageId: pageId, name: "First win" } })).id;
    leaderboardId = (await db.gamePageLeaderboard.create({ data: { gamePageId: pageId, name: "Best", type: "SCORE" } })).id;
    websiteToken = (await (await import("../src/auth/tokenStore.js")).createSessionTokens(userId)).accessToken;
    const app = express();
    app.use(express.json());
    app.use((await import("../src/middleware/responseEnvelope.js")).responseEnvelope);
    app.use("/device/code", (await import("../src/routes/v1/device/code/post.js")).default);
    app.use("/device/approve", (await import("../src/routes/v1/device/approve/post.js")).default);
    app.use("/device/token", (await import("../src/routes/v1/device/token/post.js")).default);
    app.use("/achievement", (await import("../src/routes/v1/achievement/post.js")).default);
    app.use("/score", (await import("../src/routes/v1/score/post.js")).default);
    app.use("/self/game-tokens/current", (await import("../src/routes/v1/self/game-tokens/current/delete.js")).default);
    app.use((await import("../src/features/games/player.router.js")).createPlayerReadsRouter());
    app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.statusCode ?? 500).json({ error: error.message }));
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (userId) {
      await db.deviceAuthRequest.deleteMany({ where: { gameId } });
      await db.gameAccessToken.deleteMany({ where: { gameId } });
      await db.score.deleteMany({ where: { leaderboardId } });
      await db.gamePageAchievement.deleteMany({ where: { gamePageId: pageId } });
      await db.gamePageLeaderboard.deleteMany({ where: { gamePageId: pageId } });
      await db.gamePage.delete({ where: { id: pageId } });
      await db.game.delete({ where: { id: gameId } });
      await db.team.delete({ where: { id: teamId } });
      await db.jam.delete({ where: { id: jamId } });
      await db.user.delete({ where: { id: userId } });
    }
    await db?.$disconnect();
  });
  async function post(path: string, body: unknown, token?: string) {
    return fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  }
  it("completes device approval, player writes, public/private reads and revocation over HTTP", async () => {
    const started = await post("/device/code", { clientName: "Fixture game", gameSlug: slug });
    expect(started.status).toBe(200);
    const request = (await started.json()).data;
    expect((await post("/device/approve", { userCode: request.userCode }, websiteToken)).status).toBe(200);
    const poll = await post("/device/token", { deviceCode: request.deviceCode });
    expect(poll.status).toBe(200);
    const { token, status } = (await poll.json()).data;
    expect(status).toBe("approved");
    const headers = { Authorization: `Bearer ${token}` };
    expect((await post("/achievement", { achievementId }, token)).status).toBe(200);
    expect((await post("/score", { leaderboardId, score: 123 }, token)).status).toBe(200);
    const owned = await fetch(base + "/self/achievements", { headers });
    expect(owned.status).toBe(200);
    expect((await owned.json()).data.achievements).toEqual([expect.objectContaining({ id: achievementId, owned: true })]);
    const scores = await fetch(base + `/leaderboards/${leaderboardId}/scores`);
    expect(scores.status).toBe(200);
    expect((await scores.json()).data.scores).toEqual([expect.objectContaining({ score: 123, user: expect.objectContaining({ id: userId }) })]);
    expect((await fetch(base + "/self/game-context", { headers })).status).toBe(200);
    expect((await fetch(base + `/self/game-context?gameId=${gameId + 1}`, { headers })).status).toBe(403);
    expect((await post("/device/approve", { userCode: request.userCode }, token)).status).toBe(403);
    expect((await fetch(base + "/self/game-tokens/current", { method: "DELETE", headers })).status).toBe(200);
    expect((await fetch(base + "/self/game-context", { headers })).status).toBe(401);
  });
  it("mints and delivers exactly one token under concurrent approval and pickup", async () => {
    const request = await store.createDeviceAuthRequestInDb({ gameId, clientName: "Race fixture", expiresInMs: 60000 });
    const approvals = await Promise.all([store.approveDeviceAuthRequestInDb({ userId, userCode: request.userCode }), store.approveDeviceAuthRequestInDb({ userId, userCode: request.userCode })]);
    expect(approvals.filter(Boolean)).toHaveLength(1);
    expect(await db.gameAccessToken.count({ where: { gameId, name: "Race fixture" } })).toBe(1);
    const pickups = await Promise.all([store.consumeDeviceAuthRequestPendingTokenInDb(request.request.id), store.consumeDeviceAuthRequestPendingTokenInDb(request.request.id)]);
    expect(pickups.filter(Boolean)).toHaveLength(1);
    expect(await db.deviceAuthRequest.findUnique({ where: { id: request.request.id } })).toBeNull();
  });
  it("rolls back approval when token creation fails", async () => {
    const request = await store.createDeviceAuthRequestInDb({ gameId, clientName: "Rollback fixture", expiresInMs: 60000 });
    await expect(store.approveDeviceAuthRequestInDb({ userId: -1, userCode: request.userCode })).rejects.toThrow();
    expect(await db.deviceAuthRequest.findUnique({ where: { id: request.request.id } })).toMatchObject({ status: "PENDING", pendingToken: null, tokenId: null });
    expect(await db.gameAccessToken.count({ where: { gameId, name: "Rollback fixture" } })).toBe(0);
  });
});
