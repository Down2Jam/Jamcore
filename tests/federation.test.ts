import { describe, expect, it } from "vitest";

import {
  buildCommentObject,
  buildCreateActivity,
  buildGameObject,
  buildJamActor,
  buildNodeInfo,
  buildNodeInfoWellKnown,
  buildOrderedCollection,
  buildPostObject,
  buildTrackObject,
  buildUserActor,
  buildWebFingerForJam,
  buildWebFingerForUser,
} from "../src/features/federation/protocol/serializers.js";
import {
  getCommentObjectId,
  getJamActorHandle,
  getJamActorId,
  getPostObjectId,
  getTrackObjectId,
  getUserActorId,
} from "../src/features/federation/protocol/urls.js";

describe("federation serializers", () => {
  it("builds the jam group actor", () => {
    const actor = buildJamActor({
      name: "Spring Jam 2026",
      icon: "/images/jam.png",
      color: "#ff6600",
    }, "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----");

    expect(actor.type).toBe("Group");
    expect(actor.id).toBe(getJamActorId());
    expect(actor.preferredUsername).toBe("jam");
    expect(actor.publicKey).toEqual(
      expect.objectContaining({
        owner: getJamActorId(),
      }),
    );
    expect(actor.attachment).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Accent color",
          value: "#ff6600",
        }),
      ]),
    );
  });

  it("builds a person actor for a user", () => {
    const actor = buildUserActor({
      slug: "ben",
      name: "Ben",
      bio: "Making jam things",
      profilePicture: "/images/ben.png",
    }, "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----");

    expect(actor.type).toBe("Person");
    expect(actor.id).toBe(getUserActorId("ben"));
    expect(actor.summary).toBe("Making jam things");
    expect(actor.publicKey).toEqual(
      expect.objectContaining({
        owner: getUserActorId("ben"),
      }),
    );
    expect(actor.icon).toEqual(
      expect.objectContaining({
        type: "Image",
      }),
    );
  });

  it("builds webfinger payloads for the jam and users", () => {
    const jamWebFinger = buildWebFingerForJam();
    const userWebFinger = buildWebFingerForUser({
      slug: "ben",
      name: "Ben",
    });

    expect(jamWebFinger.subject).toBe(`acct:${getJamActorHandle()}`);
    expect(jamWebFinger.links[0]?.href).toBe(getJamActorId());
    expect(userWebFinger.subject).toBe("acct:ben@localhost");
    expect(userWebFinger.links[0]?.href).toBe(getUserActorId("ben"));
  });

  it("builds nodeinfo and ordered collections", () => {
    const nodeInfo = buildNodeInfo({ totalUsers: 42 });
    const wellKnown = buildNodeInfoWellKnown();
    const collection = buildOrderedCollection("https://example.com/outbox");

    expect(nodeInfo.protocols).toEqual(["activitypub"]);
    expect(nodeInfo.usage.users.total).toBe(42);
    expect(wellKnown.links[0]?.rel).toBe(
      "http://nodeinfo.diaspora.software/ns/schema/2.1",
    );
    expect(collection.totalItems).toBe(0);
    expect(collection.orderedItems).toEqual([]);
  });

  it("builds federated objects for forum posts and comments", () => {
    const post = buildPostObject({
      id: 12,
      title: "Theme ideas",
      content: "Let us cook",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      author: { slug: "ben" },
    });
    const comment = buildCommentObject({
      id: 34,
      content: "Replying here",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      author: { slug: "sam" },
      postId: 12,
    });

    expect(post.id).toBe(getPostObjectId(12));
    expect(post.type).toBe("Article");
    expect(comment.id).toBe(getCommentObjectId(34));
    expect(comment.inReplyTo).toBe(getPostObjectId(12));
  });

  it("builds federated game and track objects plus create activities", () => {
    const game = buildGameObject({
      slug: "cool-game",
      category: "REGULAR",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      team: { owner: { slug: "ben" } },
      gamePage: {
        name: "Cool Game",
        description: "A game",
        short: "Short desc",
        screenshots: ["/images/game.png"],
        thumbnail: "/images/thumb.png",
        trailerUrl: "https://example.com/trailer.mp4",
      },
    });
    const track = buildTrackObject({
      slug: "theme-song",
      name: "Theme Song",
      commentary: "Audio note",
      url: "https://example.com/theme.mp3",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      composer: { slug: "ben" },
      gamePage: {
        game: {
          slug: "cool-game",
        },
      },
    });
    const activity = buildCreateActivity({
      kind: "tracks",
      id: "theme-song",
      actorId: getUserActorId("ben"),
      object: track,
      published: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(game.type).toBe("Page");
    expect(track.id).toBe(getTrackObjectId("theme-song"));
    expect(activity.type).toBe("Create");
    expect(activity.object).toEqual(track);
  });
});

