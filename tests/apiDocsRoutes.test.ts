import type { AddressInfo } from "node:net";

import { Router } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { appConfig } from "../src/config/app.js";

vi.mock("../src/routes/v1/loadRoutes.js", () => ({
  loadRoutes: async () => {},
}));

vi.mock("../src/routes/v1/registry.js", async () => {
  const openApiRouter = await import("../src/routes/v1/openapi/get.js");
  const capabilitiesRouter = await import("../src/routes/v1/capabilities/get.js");

  return {
    getStaticV1Routes: () => [
      {
        path: "/openapi",
        router: openApiRouter.default,
      },
      {
        path: "/capabilities",
        router: capabilitiesRouter.default,
      },
      {
        path: "/themes",
        router: Router(),
      },
      {
        path: "/games",
        router: Router(),
      },
    ],
  };
});

describe("API docs routes", () => {
  let baseUrl = "";
  let stopServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const {
      configureHttpErrorHandling,
      configureHttpMiddleware,
      createHttpApp,
      mountHttpRoutes,
    } = await import("../src/runtime/http.js");
    const app = createHttpApp();
    configureHttpMiddleware(app);
    await mountHttpRoutes(app);
    configureHttpErrorHandling(app);

    const server = await new Promise<import("node:http").Server>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    stopServer = async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
  });

  afterAll(async () => {
    await stopServer?.();
  });

  it("serves an API landing page at /api", async () => {
    const response = await fetch(`${baseUrl}/api`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("/api/v1");
    expect(html).toContain("/api/v1/openapi");
    expect(html).toContain(appConfig.api.currentVersion);
    for (const version of appConfig.api.supportedVersions) {
      expect(html).toContain(version);
    }
  });

  it("serves v1 documentation at /api/v1", async () => {
    const response = await fetch(`${baseUrl}/api/v1`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-api-version")).toBe("v1");
    expect(html).toContain("/api/v1/openapi");
    expect(html).toContain("/api/v1/capabilities");
    expect(html).toContain("/api/v1/jams");
    expect(html).toContain("/api/v1/jams/random");
    expect(html).toContain("/api/v1/jams/{jamSlug}");
    expect(html).toContain("Jams");
    expect(html).toContain("Return detailed data for a jam");
    expect(html).toContain("/api/v1/games/random");
    expect(html).toContain("/api/v1/tracks");
    expect(html).toContain("/api/v1/tracks/random");
    expect(html).toContain("/api/v1/tracks/{trackSlug}");
    expect(html).toContain("Music");
    expect(html).toContain("Return detailed data for a track");
    expect(html).toContain("/api/v1/results");
    expect(html).toContain("/api/v1/gametags");
    expect(html).toContain("/api/v1/users/{userSlug}");
    expect(html).toContain("/api/v1/posts/{postSlug}");
    expect(html).toContain("/api/v1/teams/{teamId}");
    expect(html).toContain("/api/v1/themes/suggestion");
    expect(html).toContain("/api/v1/events");
    expect(html).toContain("/api/v1/events/{eventSlug}");
    expect(html).toContain("Events");
    expect(html).toContain("Return detailed data for an event");
    expect(html).toContain("/api/v1/tags");
    expect(html).toContain("List available post tags");
    expect(html).toContain("/api/v1/games");
    expect(html).toContain("/api/v1/search");
    expect(html).toContain("List published games");
    expect(html).toContain("Search");
    expect(html).not.toContain("/api/v1/platform/");
    expect(html).not.toContain("/api/v1/admin/images");
    expect(html).not.toContain("/api/v1/mod");
    expect(html).not.toContain("Create a documentation document");
    expect(html).not.toContain("Create a press kit media entry");
    expect(html).not.toContain("Create a custom emoji");
  });

  it("keeps the v1 OpenAPI route as JSON", async () => {
    const response = await fetch(`${baseUrl}/api/v1/openapi`);
    const document = await response.json() as {
      openapi: string;
      info?: { title?: string };
      paths?: Record<string, Record<string, any>>;
      components?: { securitySchemes?: Record<string, unknown> };
      "x-jamcore"?: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(document.openapi).toBe("3.1.0");
    expect(document.info?.title).toContain(appConfig.appName);
    expect(document.paths?.["/capabilities"]?.get).toBeTruthy();
    expect(document.paths?.["/games"]?.get?.security).toBeUndefined();
    expect(document.paths?.["/games"]?.post?.security).toEqual([
      { bearerAuth: [], refreshCookie: [] },
    ]);
    expect(document.paths?.["/games"]?.post?.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", in: "header" }),
    );
    expect(document.paths?.["/posts"]?.get?.["x-jamcore-pagination"]).toBeTruthy();
    expect(document.components?.securitySchemes).toHaveProperty("bearerAuth");
    expect(document.components?.securitySchemes).toHaveProperty("refreshCookie");
    expect(document["x-jamcore"]?.capabilitiesPath).toBe("/api/v1/capabilities");
  });

  it("serves API capability discovery", async () => {
    const response = await fetch(`${baseUrl}/api/v1/capabilities`);
    const payload = await response.json() as {
      data?: {
        api?: { currentVersion?: string };
        auth?: { userSession?: { loginPath?: string } };
        limits?: unknown;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data?.api?.currentVersion).toBe(appConfig.api.currentVersion);
    expect(payload.data?.auth?.userSession?.loginPath).toBe("/api/v1/session");
    expect(payload.data?.limits).toBeTruthy();
  });

  it("uses tenant-aware branding on the API pages", async () => {
    const landingResponse = await fetch(`${baseUrl}/api`, {
      headers: {
        Host: "localhost",
      },
    });
    const landingHtml = await landingResponse.text();
    const docsResponse = await fetch(`${baseUrl}/api/v1`, {
      headers: {
        Host: "localhost",
      },
    });
    const docsHtml = await docsResponse.text();

    const tenantAppName =
      appConfig.platform.multiTenant.tenants.find((tenant) =>
        tenant.hosts.includes("localhost"),
      )?.appName ?? appConfig.appName;

    expect(landingResponse.headers.get("x-tenant-id")).toBeTruthy();
    expect(docsResponse.headers.get("x-tenant-id")).toBeTruthy();
    expect(landingHtml).toContain(tenantAppName);
    expect(docsHtml).toContain(tenantAppName);
  });
});
