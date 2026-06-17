import { z } from "zod";

export const teamMessageSchema = z.object({
  content: z.string().trim().optional(),
});

export const teamDecisionSchema = z.object({
  accept: z.boolean().optional().default(false),
  inviteId: z.coerce.number().int().positive(),
});

export const updateTeamSchema = z.object({
  applicationsOpen: z.boolean(),
  rolesWanted: z.array(z.string().trim().min(1)),
  description: z.string().optional().nullable(),
  users: z.array(z.object({ id: z.coerce.number().int().positive() })),
  invitations: z.array(z.object({ id: z.coerce.number().int().positive() })),
  name: z.string().optional().nullable(),
});
