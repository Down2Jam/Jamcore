import db from "../../infra/db.js";

export const commentTreeInclude = {
  author: true,
  likes: true,
  commentReactions: {
    include: {
      reaction: true,
      user: {
        select: { id: true, slug: true, name: true, profilePicture: true },
      },
    },
  },
} as const;

type CommentNode = { id: number; children?: CommentNode[] };

// Batch each level across the page so query count depends on depth, not posts.
export async function loadCommentDescendants(roots: CommentNode[]) {
  let frontier = roots;
  const seen = new Set(roots.map((comment) => comment.id));
  while (frontier.length > 0) {
    const parents = new Map(frontier.map((comment) => [comment.id, comment]));
    for (const parent of frontier) parent.children = [];
    const children = await db.comment.findMany({
      where: { commentId: { in: [...parents.keys()] } },
      include: commentTreeInclude,
    });
    const next: CommentNode[] = [];
    for (const child of children) {
      const parent = child.commentId == null ? undefined : parents.get(child.commentId);
      if (!parent || seen.has(child.id)) continue;
      seen.add(child.id);
      parent.children!.push(child);
      next.push(child);
    }
    frontier = next;
  }
}
