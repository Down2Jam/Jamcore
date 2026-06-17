import { z } from "zod";

import { isAllowedAssetUrl } from "./profile.assets.js";

const recommendationIdsSchema = z.array(z.coerce.number().int().positive());

const assetUrlSchema = z
  .union([z.string(), z.null()])
  .refine((value) => isAllowedAssetUrl(value), {
    message: "Invalid asset URL.",
  })
  .optional();

export const updateUserProfileSchema = z
  .object({
    targetUserId: z.coerce.number().int().positive().optional(),
    targetUserSlug: z.string().trim().min(1).optional(),
    email: z.string().email().nullable().optional(),
    profilePicture: assetUrlSchema,
    bannerPicture: assetUrlSchema,
    profileBackground: z.string().nullable().optional(),
    bio: z.string().optional(),
    short: z.string().max(155).optional(),
    name: z.string().trim().min(1).max(64),
    primaryRoles: z.array(z.string().trim().min(1)).optional(),
    secondaryRoles: z.array(z.string().trim().min(1)).optional(),
    emotePrefix: z
      .string()
      .trim()
      .min(4)
      .max(8)
      .regex(/^[a-z0-9]+$/)
      .optional()
      .nullable(),
    pronouns: z.string().max(32).optional().nullable(),
    links: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    linkLabels: z.array(z.string().trim().max(40)).max(8).optional(),
    hideRatings: z.boolean().optional(),
    autoHideRatingsWhileStreaming: z.boolean().optional(),
    recommendedGameIds: recommendationIdsSchema.max(3).optional(),
    recommendedPostIds: recommendationIdsSchema.max(5).optional(),
    recommendedTrackIds: recommendationIdsSchema.max(3).optional(),
    recommendedHiddenGameIds: recommendationIdsSchema.optional(),
    recommendedHiddenTrackIds: recommendationIdsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.links &&
      value.linkLabels &&
      value.links.length !== value.linkLabels.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["linkLabels"],
        message: "Link labels must match links.",
      });
    }
  });

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
