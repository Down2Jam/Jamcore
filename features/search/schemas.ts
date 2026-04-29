import { z } from "zod";

const firstQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

export const searchQuerySchema = z.object({
  query: z.preprocess(firstQueryValue, z.string().trim().min(1)),
  type: z
    .preprocess(firstQueryValue, z.string().trim().optional())
    .optional(),
  limit: z
    .preprocess(firstQueryValue, z.coerce.number().int().min(1).max(10).optional())
    .optional(),
  debug: z
    .preprocess(
      firstQueryValue,
      z.union([z.literal("true"), z.literal("false")]).optional(),
    )
    .optional(),
  includeFacets: z
    .preprocess(
      firstQueryValue,
      z.union([z.literal("true"), z.literal("false")]).optional(),
    )
    .optional(),
});
