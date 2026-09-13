import cors from "cors";
import type { Request, RequestHandler } from "express";

// Device authorization and the routes that opt into allowGameToken are used by
// games on arbitrary hosts, including opaque (Origin: null) iframe sandboxes.
// Keep this list aligned with routes using allowGameToken.
const gameClientRoutes = new Map<string, string[]>([
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
    const gameMethods = gameClientRoutes.get(req.path.replace(/\/$/, "").toLowerCase());
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
