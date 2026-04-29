import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    post: mocks.post,
  },
}));

import {
  enqueueFederationDelivery,
  getFederationDeliveryRecord,
  listFederationDeliveryRecords,
  resetFederationDeliveryState,
  resumePendingFederationDeliveries,
} from "../features/federation/transport/delivery.service.js";
import { upsertPersistedDelivery } from "../features/federation/state/state.service.js";
import { appConfig } from "../config/app.js";

describe("federation delivery service", () => {
  afterEach(async () => {
    mocks.post.mockReset();
    await resetFederationDeliveryState();
  });

  it("does not queue outbound activities when federation delivery is disabled", async () => {
    expect(appConfig.federation.enabled).toBe(false);
    expect(appConfig.federation.delivery.enabled).toBe(false);
    mocks.post.mockResolvedValue({ status: 202 });

    const deliveryId = await enqueueFederationDelivery({
      inbox: "https://remote.example/inbox",
      activity: {
        id: "https://example.com/ap/activities/1",
        type: "Accept",
      },
    });

    expect(deliveryId).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(listFederationDeliveryRecords(10)).toEqual([]);
  });

  it("does not resume queued deliveries when federation delivery is disabled", async () => {
    mocks.post.mockResolvedValue({ status: 202 });

    await upsertPersistedDelivery({
      id: "delivery-9",
      inbox: "https://remote.example/inbox",
      activity: {
        id: "https://example.com/ap/activities/9",
        type: "Accept",
      },
      attempts: 0,
      status: "queued",
      lastError: null,
      activityType: "Accept",
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      nextAttemptAt: null,
    });

    await resumePendingFederationDeliveries();

    expect(mocks.post).not.toHaveBeenCalled();
    expect(getFederationDeliveryRecord("delivery-9")).toBeNull();
  });
});

