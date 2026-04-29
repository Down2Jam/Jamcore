import { randomUUID } from "node:crypto";
import { z } from "zod";

import db from "../../infra/db.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { assertPostBelongsToTenant } from "../../lib/contentTenant.js";

type AutosaveActor = {
  id: number;
  mod?: boolean | null;
  admin?: boolean | null;
};

export const autosavePostSchema = z.object({
  postId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  content: z.string().max(50_000),
  sticky: z.boolean().optional().default(false),
  tags: z.array(z.number().int().positive()).optional().default([]),
});

export async function savePostAutosave({
  actor,
  input,
  tenantId,
}: {
  actor: AutosaveActor;
  input: z.infer<typeof autosavePostSchema>;
  tenantId?: string | null;
}) {
  if (input.postId) {
    const post = await db.post.findUnique({
      where: { id: input.postId },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundError("Post not found");
    await assertPostBelongsToTenant(post.id, tenantId);
    if (post.authorId !== actor.id && !actor.mod && !actor.admin) {
      throw new ForbiddenError("Not allowed");
    }
  }

  const existing = await db.postAutosave.findFirst({
    where: {
      tenantId: tenantId ?? null,
      authorId: actor.id,
      postId: input.postId ?? null,
    },
    select: { id: true },
  });
  if (existing) {
    await db.postAutosave.update({
      where: { id: existing.id },
      data: {
        title: input.title ?? null,
        content: input.content,
        sticky: input.sticky,
        tags: input.tags,
        updatedAt: new Date(),
      },
    });
  } else {
    await db.postAutosave.create({
      data: {
        id: randomUUID(),
        postId: input.postId ?? null,
        authorId: actor.id,
        tenantId: tenantId ?? null,
        title: input.title ?? null,
        content: input.content,
        sticky: input.sticky,
        tags: input.tags,
      },
    });
  }
  return getPostAutosaves({ actor, tenantId });
}

export async function getPostAutosaves({
  actor,
  tenantId,
}: {
  actor: AutosaveActor;
  tenantId?: string | null;
}) {
  return db.postAutosave.findMany({
    where: {
      authorId: actor.id,
      tenantId: tenantId ?? null,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
}
