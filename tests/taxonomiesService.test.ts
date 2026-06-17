import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    flag: {
      findMany: vi.fn(),
    },
    tag: {
      findMany: vi.fn(),
    },
    trackTag: {
      findMany: vi.fn(),
    },
    trackFlag: {
      findMany: vi.fn(),
    },
    ratingCategory: {
      findMany: vi.fn(),
    },
    trackRatingCategory: {
      findMany: vi.fn(),
    },
    teamRole: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import {
  listFlags,
  listGameTags,
  listPostTags,
  listRatingCategories,
  listTeamRoles,
  listTrackFlags,
  listTrackRatingCategories,
  listTrackTags,
} from "../src/features/taxonomies";

describe("taxonomies service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists post tags with the post tag filter", async () => {
    dbMock.tag.findMany.mockResolvedValueOnce([]);

    await listPostTags();

    expect(dbMock.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postTag: true },
      }),
    );
  });

  it("lists game tags with the game tag filter", async () => {
    dbMock.tag.findMany.mockResolvedValueOnce([]);

    await listGameTags();

    expect(dbMock.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gameTag: true },
      }),
    );
  });

  it("passes the always flag through to rating category listing", async () => {
    dbMock.ratingCategory.findMany.mockResolvedValueOnce([]);

    await listRatingCategories({ always: "true" });

    expect(dbMock.ratingCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { always: true },
      }),
    );
  });

  it("lists the remaining taxonomy collections", async () => {
    dbMock.flag.findMany.mockResolvedValueOnce([]);
    dbMock.trackTag.findMany.mockResolvedValueOnce([]);
    dbMock.trackFlag.findMany.mockResolvedValueOnce([]);
    dbMock.trackRatingCategory.findMany.mockResolvedValueOnce([]);
    dbMock.teamRole.findMany.mockResolvedValueOnce([]);

    await listFlags();
    await listTrackTags();
    await listTrackFlags();
    await listTrackRatingCategories();
    await listTeamRoles();

    expect(dbMock.flag.findMany).toHaveBeenCalled();
    expect(dbMock.trackTag.findMany).toHaveBeenCalled();
    expect(dbMock.trackFlag.findMany).toHaveBeenCalled();
    expect(dbMock.trackRatingCategory.findMany).toHaveBeenCalled();
    expect(dbMock.teamRole.findMany).toHaveBeenCalled();
  });
});

