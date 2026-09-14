import type { Request } from "express";
import { ForbiddenError } from "../lib/errors.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const registry = require("../contracts/api-registry.json") as typeof import("../contracts/api-registry.json");

const appRoutes = registry.routes.filter(route => route.visibility === "public" && route.auth.kind !== "platform")
  .map(route => ({ method: route.method, pattern: new RegExp("^" + route.path.split(/(\{[^}]+\})/)
    .map(part => part.startsWith("{") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("") + "$", "i") }));

export const APP_SCOPES = {
  "profile:read": "Read your profile and account summary",
  "content:read": "Read content you can access, including unpublished content",
  "content:write": "Create, edit and delete content using your permissions",
  "messages:read": "Read your private messages",
  "messages:write": "Send and manage your private messages",
  "notifications:read": "Read your notifications",
  "notifications:write": "Manage your notifications and preferences",
  "games:read": "Read game data and your game progress",
  "games:write": "Submit and manage scores and achievements",
} as const;
export type AppScope = keyof typeof APP_SCOPES;

// Explicit resource allowlist: unreviewed, account-security and privileged routes fail closed.
export function requiredAppScope(path: string, method: string): AppScope | null {
  const read = method === "GET" || method === "HEAD";
  if (!["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"].includes(method)) return null;
  const clean = path.replace(/\/$/, "").toLowerCase();
  if (!appRoutes.some(route => route.method === (method === "HEAD" ? "GET" : method) && route.pattern.test(clean))) return null;
  if (clean === "/self" || clean === "/self/current-game") return read ? "profile:read" : null;
  if (/^\/users\/[^/]+\/block$/.test(clean)) return read ? null : "messages:write";
  if (/^\/users\/[^/]+\/follow$/.test(clean)) return read ? null : "content:write";
  if (/^\/users\/[^/]+$/.test(clean) && read) return "content:read";
  if (/^\/messages(?:\/|$)/.test(clean)) return read ? "messages:read" : "messages:write";
  if (/^\/notifications(?:\/|$)/.test(clean)) return read ? "notifications:read" : "notifications:write";
  if (["/self/game-context", "/self/achievements", "/self/scores"].includes(clean) || /^\/games\/[^/]+\/(leaderboards|achievements)$/.test(clean) || /^\/leaderboards\/[^/]+\/scores$/.test(clean)) return read ? "games:read" : null;
  if (["/score", "/achievement"].includes(clean)) return read ? "games:read" : "games:write";
  if (!read && (clean === "/quilts" || /^\/quilts\/[^/]+\/resize$/.test(clean) || /^\/quilts\/submissions\/[^/]+\/accept$/.test(clean))) return null;
  if (/^\/(games|posts|comment|comments|collections|teams|themes|quilt|quilts|rating|ratings|like|likes|reaction|reactions|tracks|music|events|jams|join-jam|leave-team|invite|application|recap|results|radio|track-rating|track-timestamp-comments|image|emojis|reports)(?:\/|$)/.test(clean) || clean === "/post/reaction") {
    return read ? "content:read" : "content:write";
  }
  return null;
}
export function assertAppScope(req: Request, scopes: string[]) {
  const pathname = new URL(req.originalUrl, "http://internal").pathname.replace(/^\/api\/v1(?=\/|$)/i, "");
  const required = requiredAppScope(pathname, req.method);
  if (!required || !scopes.includes(required)) throw new ForbiddenError("This app has not been granted permission for this endpoint.");
}
