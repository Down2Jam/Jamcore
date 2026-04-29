import { PageVersion } from "@prisma/client";

import type {
  OptionalRequestUserContext,
  OptionalRequestUserRecord,
  RequestUserContext,
  RequestUserRating,
  RequestUserRecord,
} from "../../types/user.js";

function normalizeRequestUserRating(rating: RequestUserRating) {
  return {
    ...rating,
    gameId: rating.gamePage?.gameId ?? null,
    pageVersion:
      rating.gamePage?.version === PageVersion.POST_JAM
        ? PageVersion.POST_JAM
        : PageVersion.JAM,
  };
}

export function presentRequestUser(user: RequestUserRecord): RequestUserContext {
  return {
    ...user,
    ratings: (user.ratings ?? []).map(normalizeRequestUserRating),
  };
}

export function presentOptionalRequestUser(
  user: OptionalRequestUserRecord,
): OptionalRequestUserContext {
  return {
    ...user,
    ratings: (user.ratings ?? []).map(normalizeRequestUserRating),
  };
}
