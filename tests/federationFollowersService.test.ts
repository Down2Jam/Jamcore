import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildFollowersCollection,
  buildFollowingCollection,
  recordFollower,
  recordFollowing,
  undoFollower,
  undoFollowing,
} from "../features/federation/state/followers.service.js";
import { getJamActorId } from "../features/federation/protocol/urls.js";
import { clearFederationState } from "../features/federation/state/state.service.js";

describe("federation followers service", () => {
  beforeEach(async () => {
    await clearFederationState();
  });

  afterEach(async () => {
    await clearFederationState();
  });

  it("records active followers into collections", async () => {
    await recordFollower({
      activityId: "https://remote.example/follows/1",
      actorId: "https://remote.example/users/alice",
      targetActorId: getJamActorId(),
      inbox: "https://remote.example/inbox",
    });

    const collection = await buildFollowersCollection(getJamActorId());

    expect(collection.totalItems).toBe(1);
    expect(collection.orderedItems).toEqual([
      "https://remote.example/users/alice",
    ]);
  });

  it("removes undone followers from active collections", async () => {
    await recordFollower({
      activityId: "https://remote.example/follows/1",
      actorId: "https://remote.example/users/alice",
      targetActorId: getJamActorId(),
      inbox: "https://remote.example/inbox",
    });
    await undoFollower("https://remote.example/follows/1");

    const collection = await buildFollowersCollection(getJamActorId());
    expect(collection.totalItems).toBe(0);
  });

  it("records and removes following relationships", async () => {
    await recordFollowing({
      activityId: "https://remote.example/follows/1",
      actorId: getJamActorId(),
      targetActorId: "https://remote.example/users/alice",
      targetInbox: "https://remote.example/inbox",
    });

    expect(await buildFollowingCollection(getJamActorId())).toEqual(
      expect.objectContaining({
        totalItems: 1,
        orderedItems: ["https://remote.example/users/alice"],
      }),
    );

    await undoFollowing("https://remote.example/follows/1");

    expect(await buildFollowingCollection(getJamActorId())).toEqual(
      expect.objectContaining({
        totalItems: 0,
        orderedItems: [],
      }),
    );
  });
});

