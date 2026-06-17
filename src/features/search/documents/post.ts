import db from "../../../infra/db.js";
import type { SearchDocumentRecord } from "../../../infra/searchStore.js";

export async function buildPostSearchDocuments(input: {
  postId: number;
  tenantId?: string | null;
}) {
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      deletedAt: true,
      removedAt: true,
      updatedAt: true,
      author: {
        select: {
          name: true,
        },
      },
      tags: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!post || post.deletedAt || post.removedAt) {
    return [];
  }

  return [
    {
      documentId: `post:${post.id}`,
      tenantId: input.tenantId ?? null,
      entityType: "post",
      entityId: post.id,
      variant: null,
      title: post.title,
      subtitle: post.author?.name ?? null,
      body: post.content,
      slug: post.slug ?? null,
      tags: post.tags.map((tag) => tag.name),
      visibility: "public",
      metadata: {},
      sourceUpdatedAt: post.updatedAt.toISOString(),
      indexedAt: new Date().toISOString(),
    },
  ] satisfies SearchDocumentRecord[];
}
