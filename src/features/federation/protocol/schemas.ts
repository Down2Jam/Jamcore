import { z } from "zod";

const actorRefSchema = z.string().url();

const followActivitySchema = z.object({
  "@context": z.unknown().optional(),
  id: z.string().url(),
  type: z.literal("Follow"),
  actor: actorRefSchema,
  object: z.string().url(),
});

const likeActivitySchema = z.object({
  "@context": z.unknown().optional(),
  id: z.string().url(),
  type: z.literal("Like"),
  actor: actorRefSchema,
  object: z.string().url(),
});

const announceActivitySchema = z.object({
  "@context": z.unknown().optional(),
  id: z.string().url(),
  type: z.literal("Announce"),
  actor: actorRefSchema,
  object: z.string().url(),
});

const noteObjectSchema = z
  .object({
    id: z.string().url().optional(),
    type: z.union([z.literal("Note"), z.literal("Article"), z.literal("Page")]),
    attributedTo: z.string().url().optional(),
    name: z.string().optional(),
    summary: z.string().optional(),
    content: z.string().optional().default(""),
    url: z.union([z.string().url(), z.array(z.unknown())]).optional(),
    published: z.string().datetime().optional(),
    inReplyTo: z.string().url().optional(),
    tag: z.union([z.array(z.unknown()), z.unknown()]).optional(),
    to: z.union([z.array(z.unknown()), z.unknown()]).optional(),
    cc: z.union([z.array(z.unknown()), z.unknown()]).optional(),
    audience: z.union([z.array(z.unknown()), z.unknown()]).optional(),
    source: z.unknown().optional(),
  })
  .passthrough();

const createActivitySchema = z.object({
  "@context": z.unknown().optional(),
  id: z.string().url(),
  type: z.literal("Create"),
  actor: actorRefSchema,
  object: noteObjectSchema,
});

const undoActivitySchema = z.object({
  "@context": z.unknown().optional(),
  id: z.string().url(),
  type: z.literal("Undo"),
  actor: actorRefSchema,
  object: z.union([
    z.object({
      id: z.string().url().optional(),
      type: z.literal("Follow"),
      actor: actorRefSchema.optional(),
      object: z.string().url(),
    }),
    z.object({
      id: z.string().url().optional(),
      type: z.literal("Like"),
      actor: actorRefSchema.optional(),
      object: z.string().url(),
    }),
    z.object({
      id: z.string().url().optional(),
      type: z.literal("Announce"),
      actor: actorRefSchema.optional(),
      object: z.string().url(),
    }),
  ]),
});

export const inboxActivitySchema = z.union([
  followActivitySchema,
  likeActivitySchema,
  announceActivitySchema,
  createActivitySchema,
  undoActivitySchema,
]);

export type InboxActivity = z.infer<typeof inboxActivitySchema>;
