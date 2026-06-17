import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    reaction: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    game: {
      findUnique: vi.fn(),
    },
    gamePage: {
      update: vi.fn(),
    },
    postReaction: {
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
    commentReaction: {
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
    radioEmote: {
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(async (operations: unknown[]) => operations),
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import { ForbiddenError } from "../src/lib/errors.js";
import {
  createUserEmoji,
  deleteEmoji,
  listEmojis,
  updateEmoji,
} from "../src/features/emojis";

describe("emojis service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.postReaction.groupBy.mockResolvedValue([]);
    dbMock.commentReaction.groupBy.mockResolvedValue([]);
    dbMock.radioEmote.groupBy.mockResolvedValue([]);
  });

  it("creates a user emoji with the user's prefix", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({
      id: 7,
      slug: "artist",
      emotePrefix: "jamz",
    });
    dbMock.reaction.findUnique.mockResolvedValueOnce(null);
    dbMock.reaction.create.mockResolvedValueOnce({
      id: 2,
      slug: "jamzwave",
      image: "https://example.com/wave.png",
      ownerUser: { id: 7, slug: "artist", name: "Artist", profilePicture: null },
      ownerGame: null,
    });

    await createUserEmoji({
      actorId: 7,
      input: {
        slug: "Wave",
        image: "https://example.com/wave.png",
      },
    });

    expect(dbMock.reaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: "jamzwave",
          scopeType: "USER",
          scopeUserId: 7,
        }),
      }),
    );
  });

  it("blocks non-admin users from editing global emoji", async () => {
    dbMock.reaction.findUnique.mockResolvedValueOnce({
      id: 4,
      slug: "global-emoji",
      image: "x",
      artist: null,
      artistId: null,
      scopeType: "GLOBAL",
      scopeUserId: null,
      scopeGameId: null,
      ownerGame: null,
    });

    await expect(
      updateEmoji({
        emojiId: 4,
        actor: { id: 9, admin: false },
        input: { image: "https://example.com/new.png" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deletes both post and comment reactions before removing the emoji", async () => {
    dbMock.reaction.findUnique.mockResolvedValueOnce({
      id: 4,
      slug: "owner-emoji",
      image: "x",
      artist: null,
      artistId: null,
      scopeType: "USER",
      scopeUserId: 9,
      scopeGameId: null,
      ownerGame: null,
    });
    dbMock.postReaction.deleteMany.mockReturnValueOnce({ kind: "post-delete" });
    dbMock.commentReaction.deleteMany.mockReturnValueOnce({
      kind: "comment-delete",
    });
    dbMock.reaction.delete.mockReturnValueOnce({ kind: "reaction-delete" });

    await deleteEmoji({
      emojiId: 4,
      actor: { id: 9, admin: false },
    });

    expect(dbMock.$transaction).toHaveBeenCalledWith([
      { kind: "post-delete" },
      { kind: "comment-delete" },
      { kind: "reaction-delete" },
    ]);
  });

  it("materializes owner game name and thumbnail from the jam page", async () => {
    dbMock.reaction.findMany.mockResolvedValueOnce([
      {
        id: 1,
        slug: "game-emoji",
        ownerGame: {
          id: 3,
          slug: "space-race",
          pages: [{ name: "Space Race", thumbnail: "thumb.png" }],
        },
      },
    ]);

    const emojis = await listEmojis();

    expect(emojis[0]).toEqual(
      expect.objectContaining({
        ownerGame: expect.objectContaining({
          name: "Space Race",
          thumbnail: "thumb.png",
        }),
      }),
    );
  });
});

