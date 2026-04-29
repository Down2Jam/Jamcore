import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("new feature hardening", () => {
  it("keeps special post and collection routes before slug/id catch-alls", () => {
    const postsRouter = fs.readFileSync(path.join(root, "features/posts/router.ts"), "utf8");
    expect(postsRouter.indexOf('"/series"')).toBeGreaterThan(-1);
    expect(postsRouter.indexOf('"/series"')).toBeLessThan(postsRouter.indexOf('"/:postSlug"'));

    const collectionsRouter = fs.readFileSync(path.join(root, "features/collections/router.ts"), "utf8");
    expect(collectionsRouter.indexOf('"/import"')).toBeGreaterThan(-1);
    expect(collectionsRouter.indexOf('"/import"')).toBeLessThan(collectionsRouter.indexOf('"/:collectionId"'));
  });

  it("documents request examples for the newly added write endpoints", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, "contracts/api-registry.json"), "utf8"),
    ) as { routes: Array<{ sdkName: string; requestBody?: boolean; requestExample?: unknown }> };
    const routes = new Map(registry.routes.map((route) => [route.sdkName, route]));
    for (const sdkName of [
      "createPostSeries",
      "addPostToSeries",
      "importCollection",
      "addCollectionComment",
      "followCollection",
      "followUser",
    ]) {
      expect(routes.get(sdkName)?.requestBody).toBe(true);
      expect(routes.get(sdkName)?.requestExample).toBeTruthy();
    }
  });

  it("generates SDK methods that accept path params instead of literal placeholders", () => {
    const sdk = fs.readFileSync(path.join(root, "generated/sdk.ts"), "utf8");
    expect(sdk).toContain("forkCollection: (collectionId: string)");
    expect(sdk).toContain("`/collections/${collectionId}/fork`");
    expect(sdk).toContain("followUser: (userSlug: string, body: unknown)");
    expect(sdk).toContain("`/users/${userSlug}/follow`");
  });
});
