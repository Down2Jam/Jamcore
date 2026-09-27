import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiCors } from "../src/middleware/apiCors.js";
import registry from "../src/contracts/api-registry.json";

const site = "https://d2jam.com";
it("allows anonymous GET and HEAD from external origins on every public read", async () => {
  for (const route of registry.routes.filter(route => route.method === "GET" && route.visibility === "public" && !route.auth.required)) {
    const path = route.path.replace(/\{[^}]+\}/g, "example");
    for (const method of ["GET", "HEAD"]) {
      const response = await fetch(`${base}/api/v1${path}`, { method, headers: { Origin: "https://example.com" } });
      expect(response.headers.get("Access-Control-Allow-Origin"), `${method} ${path}`).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    }
  }
});
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(createApiCors(`${site}/`));
  app.use((_req, res) => res.status(401).json({ error: "Unauthorized" }));
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

describe("browser game CORS", () => {
  it.each(["https://play.d2jam.com", "null", "https://external-game.example", site])(
    "supports device flow preflights and error responses from %s", async (origin) => {
      for (const path of ["/api/v1/device/code", "/api/v1/device/token/"]) {
        for (const method of ["OPTIONS", "POST"]) {
          const response = await fetch(`${base}${path}`, {
            method,
            headers: {
              Origin: origin,
              ...(method === "OPTIONS" ? {
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,authorization,idempotency-key",
              } : {}),
            },
          });
          expect(response.status).toBe(method === "OPTIONS" ? 204 : 401);
          expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin === site ? site : "*");
          expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(origin === site ? "true" : null);
          expect(response.headers.get("Vary")).toContain("Origin");
          if (method === "OPTIONS") {
            expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
            expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type,Authorization,Idempotency-Key");
          }
        }
      }
    },
  );

  it.each([
    ["/api/v1/self/game-context", "GET"],
    ["/api/v1/self", "GET"],
    ["/api/v1/oauth/token", "POST"],
    ["/api/v1/games/a-game", "GET"],
    ["/api/v1/self/achievements", "GET"],
    ["/api/v1/leaderboards/9/scores", "GET"],
    ["/api/v1/achievement", "POST"],
    ["/api/v1/achievement", "DELETE"],
    ["/api/v1/score", "POST"],
    ["/api/v1/score", "DELETE"],
    ["/api/v1/image", "POST"],
    ["/api/v1/self/game-tokens/current", "DELETE"],
  ])("allows game-token clients on %s %s", async (path, method) => {
    const response = await fetch(`${base}${path}`, {
      method: "OPTIONS",
      headers: { Origin: "null", "Access-Control-Request-Method": method },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(method);
  });

  it.each([
    ["/api/v1/device/approve", "POST"],
    ["/api/v1/leaderboards/9/scores/extra", "GET"],
    ["/api/v1/leaderboards/9/scores", "POST"],
    ["/api/v1/device/deny", "POST"],
    ["/api/v1/self/game-tokens", "DELETE"],
    ["/api/v1/oauth/apps", "POST"],
    ["/api/v1/session/refresh", "POST"],
    ["/api/v1/device/code/extra", "POST"],
    ["/api/v1/device/code", "DELETE"],
    ["/api/v1/image", "DELETE"],
  ])("keeps %s %s restricted to the site", async (path, method) => {
    for (const origin of ["null", "https://play.d2jam.com", site]) {
      const response = await fetch(`${base}${path}`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": method },
      });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(site);
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    }
  });
});
