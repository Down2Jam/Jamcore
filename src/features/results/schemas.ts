import { z } from "zod";

const firstQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

export const resultsQuerySchema = z.object({
  category: z.preprocess(firstQueryValue, z.string().trim().optional()),
  contentType: z.preprocess(firstQueryValue, z.string().trim().optional()),
  sort: z.preprocess(firstQueryValue, z.string().trim().optional()),
  jam: z.preprocess(firstQueryValue, z.string().trim().optional()),
  preview: z.preprocess(firstQueryValue, z.string().trim().optional()),
  recap: z.preprocess(firstQueryValue, z.string().trim().optional()),
});

export type ResultsQuery = z.infer<typeof resultsQuerySchema>;
