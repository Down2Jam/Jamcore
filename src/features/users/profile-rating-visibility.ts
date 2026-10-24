import { PageVersion } from "@prisma/client";
import db from "../../infra/db.js";
import { areRatingValuesPublic } from "../ratings/visibility.js";

type ProfileRating = {
  value?: number;
  pageVersion?: PageVersion;
  game?: { jamId: number } | null;
  gamePage?: { version?: PageVersion | null } | null;
  track?: { gamePage?: { version?: PageVersion; game?: { jamId: number } | null } | null } | null;
};

export async function publicProfileRatings<T extends { ratings: ProfileRating[]; trackRatings: ProfileRating[] }>(profile: T) {
  const jamIdFor = (rating: ProfileRating) => rating.game?.jamId ?? rating.track?.gamePage?.game?.jamId;
  const jamIds = [...new Set([...profile.ratings, ...profile.trackRatings].map(jamIdFor).filter((id): id is number => id != null))];
  const jams = await db.jam.findMany({ where: { id: { in: jamIds } } });
  const byId = new Map(jams.map(jam => [jam.id, jam]));
  const redact = (rating: ProfileRating) => ({
    ...rating,
    value: areRatingValuesPublic(byId.get(jamIdFor(rating) ?? -1), rating.pageVersion ?? rating.gamePage?.version ?? rating.track?.gamePage?.version ?? PageVersion.JAM)
      ? rating.value : undefined,
  });
  return { ...profile, ratings: profile.ratings.map(redact), trackRatings: profile.trackRatings.map(redact) };
}
