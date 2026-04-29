import { describe, expect, it } from "vitest";

import {
  buildAcceptActivity,
  getActorIdForInboxTarget,
} from "../features/federation/protocol/activities.js";
import { getJamActorId, getUserActorId } from "../features/federation/protocol/urls.js";

describe("federation activities", () => {
  it("builds accept activities for follows", () => {
    const accept = buildAcceptActivity({
      actorId: getJamActorId(),
      follow: {
        id: "https://remote.example/follows/1",
        actor: "https://remote.example/users/alice",
        object: getJamActorId(),
      },
    });

    expect(accept.type).toBe("Accept");
    expect(accept.actor).toBe(getJamActorId());
    expect(accept.object).toEqual(
      expect.objectContaining({
        type: "Follow",
        actor: "https://remote.example/users/alice",
      }),
    );
  });

  it("resolves actor ids for inbox targets", () => {
    expect(getActorIdForInboxTarget({ kind: "jam" })).toBe(getJamActorId());
    expect(getActorIdForInboxTarget({ kind: "user", slug: "ben" })).toBe(
      getUserActorId("ben"),
    );
  });
});

