import { z } from "zod";

export const createThemeSuggestionSchema = z.object({
  suggestionText: z.string().trim().min(1),
  description: z.string().optional(),
});

export const createCurrentJamThemeSuggestionSchema = z.object({
  suggestionText: z.string().trim().min(1),
  description: z.string().optional(),
  userId: z.coerce.number().int().positive(),
});

export const deleteThemeSuggestionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const slaughterVoteSchema = z.object({
  suggestionId: z.coerce.number().int().positive(),
  voteType: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

export const votingVoteSchema = z.object({
  suggestionId: z.coerce.number().int().positive(),
  voteType: z.union([z.literal(0), z.literal(1), z.literal(3)]),
});

export const listThemesQuerySchema = z.object({
  isVoting: z.union([z.literal("0"), z.literal("1")]).optional(),
});
