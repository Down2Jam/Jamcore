import type { AddressInfo } from "node:net";

import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { appConfig } from "../config/app.js";
import { createFederationRouter } from "../features/federation/router.js";

describe("federation router", () => {
  const originalEnabled = appConfig.federation.enabled;

  afterEach(() => {
    appConfig.federation.enabled = originalEnabled;
  });

  it("returns 404 for all federation routes when federation is disabled", async () => {
    appConfig.federation.enabled = false;
    const app = express();
    app.use(express.json());
    app.use(createFederationRouter());

    const server = await new Promise<import("node:http").Server>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const discoveryResponse = await fetch(`${baseUrl}/.well-known/nodeinfo`);
      const inboxResponse = await fetch(`${baseUrl}/ap/actors/jam/inbox`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "Follow" }),
      });
      const diagnosticResponse = await fetch(`${baseUrl}/ap/deliveries`);

      expect(discoveryResponse.status).toBe(404);
      expect(inboxResponse.status).toBe(404);
      expect(diagnosticResponse.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
