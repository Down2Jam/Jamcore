import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../features/federation/transport/delivery.service.js", () => ({
  enqueueFederationDelivery: vi.fn(async (_input: unknown) => "delivery-1"),
}));

import { recordFollower } from "../features/federation/state/followers.service.js";
import {
  publishActivityToAudience,
  publishActivityToFollowers,
} from "../features/federation/outbox/publication.service.js";
import { getJamActorId, getUserActorId } from "../features/federation/protocol/urls.js";
import { clearFederationState } from "../features/federation/state/state.service.js";
import { enqueueFederationDelivery } from "../features/federation/transport/delivery.service.js";

describe("federation publication service", () => {
  afterEach(async () => {
    await clearFederationState();
    vi.clearAllMocks();
  });

  it("publishes activities to persisted followers with inboxes", async () => {
    await recordFollower({
      activityId: "https://remote.example/follows/1",
      actorId: "https://remote.example/users/alice",
      targetActorId: getJamActorId(),
      inbox: "https://remote.example/inbox",
    });

    const deliveryIds = await publishActivityToFollowers({
      actorId: getJamActorId(),
      activity: {
        type: "Create",
        actor: getJamActorId(),
      },
    });

    expect(deliveryIds).toEqual(["delivery-1"]);
    expect(enqueueFederationDelivery).toHaveBeenCalledWith({
      inbox: "https://remote.example/inbox",
      activity: {
        type: "Create",
        actor: getJamActorId(),
      },
    });
  });

  it("deduplicates follower inboxes across multiple audience actors", async () => {
    await recordFollower({
      activityId: "https://remote.example/follows/1",
      actorId: "https://remote.example/users/alice",
      targetActorId: getJamActorId(),
      inbox: "https://remote.example/shared-inbox",
    });

    await recordFollower({
      activityId: "https://remote.example/follows/2",
      actorId: "https://remote.example/users/alice",
      targetActorId: getUserActorId("ben"),
      inbox: "https://remote.example/shared-inbox",
    });

    const deliveryIds = await publishActivityToAudience({
      actorIds: [getJamActorId(), getUserActorId("ben")],
      activity: {
        type: "Update",
        actor: getUserActorId("ben"),
      },
    });

    expect(deliveryIds).toEqual(["delivery-1"]);
    expect(enqueueFederationDelivery).toHaveBeenCalledTimes(1);
    expect(enqueueFederationDelivery).toHaveBeenCalledWith({
      inbox: "https://remote.example/shared-inbox",
      activity: {
        type: "Update",
        actor: getUserActorId("ben"),
      },
    });
  });
});

