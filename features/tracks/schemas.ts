import { z } from "zod";
import { PageVersion } from "@prisma/client";

const firstQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

export const listTracksQuerySchema = z.object({
  jamId: z.preprocess(firstQueryValue, z.string().trim().optional()),
  jamSlug: z.preprocess(firstQueryValue, z.string().trim().optional()),
  sort: z.preprocess(firstQueryValue, z.string().trim().optional()),
  pageVersion: z.preprocess(firstQueryValue, z.string().trim().optional()),
});

export const trackParamsSchema = z.object({
  trackSlug: z.string().trim().min(1),
});

export const trackDetailQuerySchema = z.object({
  pageVersion: z.preprocess(firstQueryValue, z.string().trim().optional()),
});

export type ListingPageVersion = PageVersion | "ALL";

export type TrackViewer =
  | {
      id?: number | null;
      mod?: boolean | null;
      admin?: boolean | null;
    }
  | null
  | undefined;
