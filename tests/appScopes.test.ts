import { describe, expect, it } from "vitest";
import { requiredAppScope, assertAppScope } from "../src/auth/appScopes.js";
import { authorizeSchema, registerAppSchema } from "../src/auth/oauth.js";
import registry from "../src/contracts/api-registry.json";
describe("app permissions and OAuth inputs", () => {
  it("accounts for every authenticated public route, with explicit website-only exceptions", () => {
    const siteOnly = new Set([
      "PUT /users/{userSlug}", "DELETE /users/{userSlug}", "PUT /languages/current",
      "POST /quilts", "POST /quilts/{quiltSlug}/resize", "POST /quilts/submissions/{submissionId}/accept",
      "GET /self/game-tokens", "DELETE /self/game-tokens", "DELETE /self/game-tokens/current",
      "POST /device/approve", "POST /device/deny", "GET /connections/twitch", "POST /connections/twitch",
      "POST /oauth/authorize", "GET /oauth/apps", "POST /oauth/apps", "DELETE /oauth/apps",
      "GET /oauth/connections", "DELETE /oauth/connections",
    ]);
    for (const route of registry.routes.filter(route => route.visibility === "public" && route.auth.required)) {
      const scope = requiredAppScope(route.path, route.method);
      if (siteOnly.has(`${route.method} ${route.path}`)) expect(scope, `${route.method} ${route.path}`).toBeNull();
      else expect(scope, `${route.method} ${route.path}`).not.toBeNull();
    }
  });
  it.each(["/image", "/music", "/comment", "/post/reaction", "/radio/vote", "/events", "/join-jam", "/invite", "/application", "/track-rating", "/reports", "/users/person/follow"])("supports ordinary app mutations: %s", path => {
    expect(requiredAppScope(path, "POST")).toBe("content:write");
  });
  it("requires messaging consent for user blocking", () => {
    expect(requiredAppScope("/users/person/block", "PUT")).toBe("messages:write");
    expect(requiredAppScope("/users/person/block", "DELETE")).toBe("messages:write");
  });
  it.each(["/admin/users", "/self/game-tokens", "/session", "/oauth/authorize", "/users/me", "/platform", "/unknown"])("denies unreviewed or privileged resource %s", path => {
    expect(requiredAppScope(path, "POST")).toBeNull();
  });
  it("separates private-message access from content access", () => {
    expect(() => assertAppScope({ originalUrl: "/api/v1/messages/conversations", method: "GET" } as never, ["content:read"])).toThrow();
    expect(() => assertAppScope({ originalUrl: "/api/v1/messages/conversations", method: "GET" } as never, ["messages:read"])).not.toThrow();
  });
  it("does not treat a read scope as write permission", () => {
    expect(() => assertAppScope({ originalUrl: "/api/v1/score", method: "POST" } as never, ["games:read"])).toThrow();
  });
  it.each(["http://client.example/callback", "javascript:alert(1)", "https://client.example/#fragment", "https://user:password@client.example/"])("rejects unsafe redirect URI %s", uri => {
    expect(registerAppSchema.safeParse({ name: "App", redirectUris: [uri] }).success).toBe(false);
  });
  it("requires S256, explicit valid scopes and a state value", () => {
    const input = { response_type: "code", client_id: crypto.randomUUID(), redirect_uri: "https://client.example/callback", code_challenge: "a".repeat(43), code_challenge_method: "S256", scope: "profile:read", state: "a".repeat(32) };
    expect(authorizeSchema.safeParse(input).success).toBe(true);
    for (const changed of [{ code_challenge_method: "plain" }, { scope: "admin" }, { state: "" }]) expect(authorizeSchema.safeParse({ ...input, ...changed }).success).toBe(false);
  });
});
