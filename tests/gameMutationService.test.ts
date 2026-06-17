import { GameCategory } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    game: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    reaction: {
      findMany: vi.fn(async () => []),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(async () => null),
    },
    $transaction: vi.fn(async () => []),
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/features/mentions/notifications.service.js", () => ({
  notifyNewMentions: vi.fn(async () => undefined),
}));

vi.mock("../src/features/games/page.service.js", () => ({
  buildPostJamBodyFromGame: vi.fn((game: unknown) => game),
  buildPrefix: vi.fn(() => "prefix"),
  getJamPage: vi.fn(() => ({ description: "before" })),
  getPostJamPage: vi.fn(() => null),
  postJamPageInclude: {},
  upsertGamePage: vi.fn(async () => undefined),
}));

vi.mock("../src/features/federation/outbox/mutation-publication.service.js", () => ({
  publishGameCreated: vi.fn(async () => ["delivery-1"]),
  publishGameUpdated: vi.fn(async () => ["delivery-2"]),
}));

import { ForbiddenError } from "../src/lib/errors.js";
import { updateGameBySlug } from "../src/features/games/mutation.service.js";
import {
  publishGameCreated,
  publishGameUpdated,
} from "../src/features/federation/outbox/mutation-publication.service.js";

const baseExistingGame = {
  id: 1,
  slug: "old-slug",
  category: GameCategory.REGULAR,
  published: true,
  emotePrefix: "prefix",
  ratingCategories: [],
  majRatingCategories: [],
  tags: [],
  flags: [],
  downloadLinks: [],
  team: {
    owner: {
      id: 2,
      slug: "owner",
    },
    users: [{ id: 2 }],
  },
  pages: [],
};

const baseUpdateBody = {
  name: "Game",
  slug: "old-slug",
  description: "after",
  downloadLinks: [],
  category: GameCategory.REGULAR,
  ratingCategories: [],
  majRatingCategories: [],
  published: true,
  flags: [],
  tags: [],
  emotePrefix: "prefix",
  pageVersion: "JAM" as const,
  itchEmbedAspectRatio: null,
  songs: [],
};

describe("game mutation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.game.findUnique.mockReset();
    dbMock.game.update.mockReset();
    dbMock.game.findUnique.mockResolvedValue(baseExistingGame);
    dbMock.game.update.mockResolvedValue({
      id: 1,
      slug: "old-slug",
      published: true,
      downloadLinks: [],
    });
  });

  it("rejects updates from users outside the game team", async () => {
    await expect(
      updateGameBySlug({
        gameSlug: "old-slug",
        body: baseUpdateBody,
        actor: {
          id: 99,
          name: "Nope",
          slug: "nope",
          mod: false,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("publishes an update when a published game keeps the same slug", async () => {
    await updateGameBySlug({
      gameSlug: "old-slug",
      body: baseUpdateBody,
      actor: {
        id: 2,
        name: "Owner",
        slug: "owner",
        mod: false,
      },
    });

    expect(publishGameUpdated).toHaveBeenCalledWith("old-slug");
    expect(publishGameCreated).not.toHaveBeenCalled();
  });

  it("publishes a create when a published game changes slug", async () => {
    dbMock.game.update.mockResolvedValue({
      id: 1,
      slug: "new-slug",
      published: true,
      downloadLinks: [],
    });

    await updateGameBySlug({
      gameSlug: "old-slug",
      body: {
        ...baseUpdateBody,
        slug: "new-slug",
      },
      actor: {
        id: 2,
        name: "Owner",
        slug: "owner",
        mod: false,
      },
    });

    expect(publishGameCreated).toHaveBeenCalledWith("new-slug");
    expect(publishGameUpdated).not.toHaveBeenCalled();
  });
});


