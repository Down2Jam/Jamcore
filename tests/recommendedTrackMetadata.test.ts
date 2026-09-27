import { describe, expect, it } from "vitest";
import { PageVersion } from "@prisma/client";
import { trackSummarySelect } from "../src/prisma/selects.js";
import { materializeTrackPage } from "../src/features/tracks/page.js";

describe("recommended track metadata", () => {
  it("preserves game artwork and name through the summary projection", () => {
    const page = {
      version: PageVersion.JAM,
      name: "Summit",
      thumbnail: "/game.png",
      soundtrackThumbnail: "/soundtrack.png",
    };
    const pageSelect = trackSummarySelect.gamePage.select.game.select.pages.select;
    const selectedPage = Object.fromEntries(
      Object.keys(pageSelect).map((key) => [key, page[key as keyof typeof page]]),
    );
    const track = materializeTrackPage({
      id: 1,
      name: "The Climb",
      gamePage: {
        version: PageVersion.JAM,
        gameId: 2,
        game: { id: 2, slug: "summit", jamId: 8, pages: [selectedPage] },
      },
    });
    expect(track.game).toMatchObject({
      name: "Summit",
      thumbnail: "/game.png",
      soundtrackThumbnail: "/soundtrack.png",
      slug: "summit",
      jamId: 8,
    });
  });

  it("selects the track's own page artwork for post-jam tracks too", () => {
    expect(trackSummarySelect.gamePage.select).toMatchObject({
      version: true, name: true, thumbnail: true, soundtrackThumbnail: true,
    });
    const track = materializeTrackPage({
      gamePage: {
        version: PageVersion.POST_JAM,
        gameId: 2,
        name: "Summit updated",
        thumbnail: "/updated.png",
        soundtrackThumbnail: "/updated-music.png",
        game: { id: 2, slug: "summit", pages: [] },
      },
    });
    expect(track.game).toMatchObject({
      name: "Summit updated",
      thumbnail: "/updated.png",
      soundtrackThumbnail: "/updated-music.png",
    });
  });
});
