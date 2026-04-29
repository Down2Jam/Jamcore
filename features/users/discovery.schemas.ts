import { z } from "zod";

const firstQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

export const searchUsersQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, z.string().trim().min(1)),
});

export const listUsersQuerySchema = z.object({
  cursor: z.preprocess(firstQueryValue, z.string().trim().optional()).optional(),
  limit: z
    .preprocess(firstQueryValue, z.coerce.number().int().min(1).max(50).optional())
    .optional(),
});
