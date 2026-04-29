import type { PageVersion, Prisma } from "@prisma/client";

import type { gameListingInclude } from "../prisma/selects.js";

export type ListingPageVersion = PageVersion | "ALL";

export type GameListingSort =
  | "oldest"
  | "newest"
  | "leastrated"
  | "danger"
  | "score"
  | "random"
  | "recommended"
  | "ratingbalance"
  | "karma";

export type GameListingRecord = Prisma.GameGetPayload<{
  include: typeof gameListingInclude;
}>;
