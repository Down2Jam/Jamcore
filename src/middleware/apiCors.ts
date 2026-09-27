import cors from "cors";
import type { Request, RequestHandler } from "express";
import { requiredAppScope } from "../auth/appScopes.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const registry = require("../contracts/api-registry.json") as typeof import("../contracts/api-registry.json");

const publicReads = registry.routes.filter(route => route.method === "GET" && route.visibility === "public" &&
  (route.auth.kind === "none" || route.auth.optional)).map(route => new RegExp("^/api/v1" +
    route.path.split(/(\{[^}]+\})/).map(part => part.startsWith("{") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("") + "/?$", "i"));

// Device authorization and the routes that opt into allowGameToken are used by
// games on arbitrary hosts, including opaque (Origin: null) iframe sandboxes.
// Keep this list aligned with routes using allowGameToken.
const gameClientRoutes = new Map<string, string[]>([
  ["/api/v1/oauth/token", ["POST"]],
  ["/api/v1/oauth/revoke", ["POST"]],
  ["/api/v1/device/code", ["POST"]],
  ["/api/v1/device/token", ["POST"]],
  ["/api/v1/achievement", ["POST", "DELETE"]],
  ["/api/v1/score", ["POST", "DELETE"]],
  ["/api/v1/image", ["POST"]],
  ["/api/v1/self/game-tokens/current", ["DELETE"]],
]);

export function createApiCors(clientOrigin: string): RequestHandler {
  const siteOrigin = new URL(clientOrigin).origin;
  const middleware = cors<Request>((req, callback) => {
    const method = req.method === "OPTIONS"
      ? req.get("Access-Control-Request-Method")?.toUpperCase()
      : req.method;
    const path = req.path.replace(/\/$/, "").toLowerCase();
    const appMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].filter(value =>
      path.startsWith("/api/v1/") && requiredAppScope(path.slice(7), value));
    if (publicReads.some(pattern => pattern.test(path))) {
      for (const readMethod of ["GET", "HEAD"]) if (!appMethods.includes(readMethod)) appMethods.push(readMethod);
    }
    const gameMethods = [...new Set([...(gameClientRoutes.get(path) ?? []), ...appMethods])];
    const gameRequest = req.get("Origin") !== siteOrigin
      && Boolean(method && gameMethods?.includes(method));

    callback(null, {
      // Wildcard CORS supports opaque origins without trusting them with cookies.
      // First-party requests retain the existing session-cookie behavior.
      origin: gameRequest ? "*" : siteOrigin,
      credentials: !gameRequest,
      ...(gameRequest ? { methods: gameMethods } : {}),
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      exposedHeaders: [
        "Authorization",
        "Content-Disposition",
        "Content-Type",
        "X-Idempotent-Replay",
        "X-Request-Id",
      ],
    });
  });
  return (req, res, next) => {
    // Both branches vary by origin, including the wildcard response.
    res.vary("Origin");
    if (req.method === "OPTIONS") res.vary("Access-Control-Request-Method");
    middleware(req, res, next);
  };
}
