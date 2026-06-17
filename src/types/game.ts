import type { GameCategory, LeaderboardType, PageVersion, Prisma } from "@prisma/client";

import type { postJamPageInclude } from "../features/games/page.service.js";

type IdRef = { id: number };
type LabeledUrl = { label: string; url: string };
type PlatformUrl = { url: string; platform: string };
type CreditInput = { role: string; userId: number };

export type GamePageRecord = Prisma.GamePageGetPayload<{
  include: typeof postJamPageInclude;
}>;

export type GameWithPages<TPage = GamePageRecord> = {
  jamPage?: TPage | null;
  postJamPage?: TPage | null;
  pages?: TPage[];
};

export type GamePageWriteSong = {
  name: string;
  slug: string;
  url: string;
  commentary?: string | null;
  tagIds?: number[];
  flagIds?: number[];
  bpm?: number | null;
  musicalKey?: string | null;
  softwareUsed?: string[];
  links?: LabeledUrl[];
  credits?: CreditInput[];
  composerId?: number | null;
  license?: string | null;
  allowDownload?: boolean;
  allowBackgroundUse?: boolean;
  allowBackgroundUseAttribution?: boolean;
};

export type GamePageWriteBody = {
  name?: string;
  description?: string;
  short?: string;
  thumbnail?: string | null;
  banner?: string | null;
  screenshots?: string[];
  trailerUrl?: string | null;
  itchEmbedUrl?: string | null;
  itchEmbedAspectRatio?: string | null;
  inputMethods?: string[];
  estOneRun?: string | null;
  estAnyPercent?: string | null;
  estHundredPercent?: string | null;
  themeJustification?: string;
  emotePrefix?: string | null;
  ratingCategories?: number[];
  majRatingCategories?: number[];
  flags?: number[];
  tags?: number[];
  achievements?: Array<{
    name: string;
    description?: string;
    image?: string;
  }>;
  leaderboards?: Array<{
    id?: number;
    name: string;
    type: LeaderboardType;
    onlyBest?: boolean;
    maxUsersShown?: number | null;
    decimalPlaces?: number | null;
  }>;
  downloadLinks?: PlatformUrl[];
  songs?: GamePageWriteSong[];
};

export type GameMutationBody = GamePageWriteBody & {
  slug: string;
  category: GameCategory;
  published: boolean;
  userSlug?: string;
  pageVersion?: PageVersion | "POST_JAM" | "JAM" | null;
};

export type GameViewer = {
  id?: number;
  admin?: boolean | null;
  mod?: boolean | null;
};

export type JamTimingContext = {
  id?: number;
  startTime?: Date | string;
  jammingHours?: number;
  submissionHours?: number;
  ratingHours?: number;
};

export type CategoryAverage = {
  categoryId: number;
  categoryName: string;
  averageScore: number;
  averageUnrankedScore: number;
  ratingCount: number;
  placement: number;
};

export type ScoreSummary = {
  placement?: number;
  averageScore?: number;
  ratingCount?: number;
  averageUnrankedScore?: number;
};

export type CategoryLike = IdRef & {
  name?: string;
  always?: boolean;
  askMajorityContent?: boolean;
};
