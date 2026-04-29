import { GameCategory, LeaderboardType } from "@prisma/client";
import { z } from "zod";

import { GAME_CATEGORY_VALUES } from "./policies.js";

export const MIN_GAME_PREFIX_LENGTH = 4;
export const MAX_GAME_PREFIX_LENGTH = 8;

export const ITCH_EMBED_ASPECT_RATIOS = [
  "16 / 9",
  "16 / 10",
  "21 / 9",
  "4 / 3",
  "5 / 4",
  "1 / 1",
  "3 / 2",
  "2 / 3",
  "3 / 4",
  "9 / 16",
  "10 / 16",
] as const;

export const gameLinkSchema = z.object({
  url: z.string().trim().min(1),
  platform: z.string().trim().min(1),
});

export const gameAchievementSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  image: z.string().optional(),
});

export const gameLeaderboardSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1),
  type: z.nativeEnum(LeaderboardType),
  onlyBest: z.boolean().optional(),
  maxUsersShown: z.coerce.number().int().nullable().optional(),
  decimalPlaces: z.coerce.number().int().nullable().optional(),
});

export const trackInputSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  url: z.string().trim().min(1),
  commentary: z.string().nullable().optional(),
  bpm: z.coerce.number().nullable().optional(),
  musicalKey: z.string().nullable().optional(),
  softwareUsed: z.array(z.string()).optional(),
  license: z.string().nullable().optional(),
  allowDownload: z.boolean().optional(),
  allowBackgroundUse: z.boolean().optional(),
  allowBackgroundUseAttribution: z.boolean().optional(),
  tagIds: z.array(z.coerce.number().int().positive()).optional(),
  flagIds: z.array(z.coerce.number().int().positive()).optional(),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        url: z.string().trim().min(1),
      }),
    )
    .optional(),
  credits: z
    .array(
      z.object({
        role: z.string().trim().min(1),
        userId: z.coerce.number().int().positive(),
      }),
    )
    .optional(),
  composerId: z.coerce.number().int().positive().nullable().optional(),
});

export const createGameSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  description: z.string().optional(),
  thumbnail: z.string().nullable().optional(),
  banner: z.string().nullable().optional(),
  downloadLinks: z.array(gameLinkSchema),
  category: z.enum(GAME_CATEGORY_VALUES) as z.ZodType<GameCategory>,
  ratingCategories: z.array(z.coerce.number().int().positive()),
  majRatingCategories: z.array(z.coerce.number().int().positive()).optional().default([]),
  published: z.boolean().optional().default(false),
  themeJustification: z.string().optional(),
  achievements: z.array(gameAchievementSchema).default([]),
  flags: z.array(z.coerce.number().int().positive()).default([]),
  tags: z.array(z.coerce.number().int().positive()).default([]),
  leaderboards: z.array(gameLeaderboardSchema.omit({ id: true })).default([]),
  short: z.string().optional(),
  songs: z.array(trackInputSchema).default([]),
  screenshots: z.array(z.string()).optional().default([]),
  trailerUrl: z.string().nullable().optional(),
  itchEmbedUrl: z.string().nullable().optional(),
  itchEmbedAspectRatio: z.enum(ITCH_EMBED_ASPECT_RATIOS).nullable().optional(),
  inputMethods: z.array(z.string()).optional().default([]),
  estOneRun: z.string().nullable().optional(),
  estAnyPercent: z.string().nullable().optional(),
  estHundredPercent: z.string().nullable().optional(),
  emotePrefix: z
    .string()
    .trim()
    .min(MIN_GAME_PREFIX_LENGTH)
    .max(MAX_GAME_PREFIX_LENGTH)
    .regex(/^[a-z0-9]+$/)
    .nullable()
    .optional(),
});

export const updateGameSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  category: z.enum(GAME_CATEGORY_VALUES) as z.ZodType<GameCategory>,
  published: z.boolean(),
  description: z.string().optional(),
  short: z.string().optional(),
  thumbnail: z.string().nullable().optional(),
  banner: z.string().nullable().optional(),
  screenshots: z.array(z.string()).optional(),
  trailerUrl: z.string().nullable().optional(),
  itchEmbedUrl: z.string().nullable().optional(),
  itchEmbedAspectRatio: z.enum(ITCH_EMBED_ASPECT_RATIOS).nullable().optional(),
  inputMethods: z.array(z.string()).optional(),
  estOneRun: z.string().nullable().optional(),
  estAnyPercent: z.string().nullable().optional(),
  estHundredPercent: z.string().nullable().optional(),
  themeJustification: z.string().optional(),
  emotePrefix: z.string().trim().nullable().optional(),
  ratingCategories: z.array(z.coerce.number().int().positive()).optional(),
  majRatingCategories: z.array(z.coerce.number().int().positive()).optional(),
  flags: z.array(z.coerce.number().int().positive()).optional(),
  tags: z.array(z.coerce.number().int().positive()).optional(),
  achievements: z.array(gameAchievementSchema).optional(),
  leaderboards: z.array(gameLeaderboardSchema).optional(),
  downloadLinks: z.array(gameLinkSchema).optional(),
  songs: z.array(trackInputSchema).optional(),
  pageVersion: z.enum(["JAM", "POST_JAM"]).optional().nullable(),
});
