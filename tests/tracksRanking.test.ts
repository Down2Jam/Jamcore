import { describe, expect, it } from "vitest";
import { PageVersion } from "@prisma/client";

import { sortTracksByScore } from "../src/features/tracks/ranking.js";

const eligibleRater = {
  user: {
    teams: [
      {
        game: {
          jamId: 7,
          category: "REGULAR",
          published: true,
        },
      },
    ],
  },
};

function makeTrack({
  id,
  trackRatings,
  gameAudioRatings,
}: {
  id: number;
  trackRatings: number[];
  gameAudioRatings: number[];
}) {
  return {
    id,
    pageVersion: PageVersion.JAM,
    game: {
      id: id + 100,
      jamId: 7,
      ratings: gameAudioRatings.map((value) => ({
        value,
        category: { name: "RatingCategory.Audio.Title" },
        gamePage: { version: PageVersion.JAM },
        ...eligibleRater,
      })),
    },
    ratings: trackRatings.map((value) => ({
      value,
      category: { name: "Overall" },
      ...eligibleRater,
    })),
  };
}

describe("track ranking", () => {
  it("fills under-rated music score sort values with parent game audio ratings before the midpoint", () => {
    const underRatedTrack = makeTrack({
      id: 1,
      trackRatings: [8, 8, 8],
      gameAudioRatings: [10],
    });
    const fullyRatedTrack = makeTrack({
      id: 2,
      trackRatings: [7.9, 7.9, 7.9, 7.9, 7.9],
      gameAudioRatings: [],
    });

    expect(sortTracksByScore([fullyRatedTrack, underRatedTrack])[0]?.id).toBe(1);
  });
});
