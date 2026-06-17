import type { PageVersion, Prisma } from "@prisma/client";

import type {
  requestUserDetailSelect,
  requestUserOptionalSelect,
  targetUserBaseSelect,
  targetUserDetailSelect,
} from "../prisma/selects.js";

export type RequestUserRecord = Prisma.UserGetPayload<{
  select: typeof requestUserDetailSelect;
}>;

export type OptionalRequestUserRecord = Prisma.UserGetPayload<{
  select: typeof requestUserOptionalSelect;
}>;

export type TargetUserBaseRecord = Prisma.UserGetPayload<{
  select: typeof targetUserBaseSelect;
}>;

export type TargetUserDetailRecord = Prisma.UserGetPayload<{
  select: typeof targetUserDetailSelect;
}>;

export type RequestUserRating = RequestUserRecord["ratings"][number];

export type NormalizedRequestUserRating = RequestUserRating & {
  gameId: number | null;
  pageVersion: PageVersion;
};

export type RequestUserContext = Omit<RequestUserRecord, "ratings"> & {
  ratings: NormalizedRequestUserRating[];
};

export type OptionalRequestUserContext = Omit<
  OptionalRequestUserRecord,
  "ratings"
> & {
  ratings: NormalizedRequestUserRating[];
};

export type FavoriteCountUser = {
  id: number;
  slug: string;
  name: string;
  profilePicture: string | null;
};

export type FavoriteGameCount = {
  gameId: number;
  count: number;
  users: FavoriteCountUser[];
};

export type FavoriteTrackCount = {
  trackId: number;
  count: number;
  users: FavoriteCountUser[];
};
