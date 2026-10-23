import db from "../../infra/db.js";

const HOUR_MS = 60 * 60 * 1000;
const ACTIVITY_WINDOW_MS = 7 * 24 * HOUR_MS;
type CommentActivity = { authorId: number; createdAt: Date };

// Inspired by Lemmy's logarithmic popularity and time decay. Activity is
// additive instead of resetting a post's age whenever one comment arrives.
export function calculatePostActiveScore(likes: number, createdAt: Date, authorId: number, comments: CommentActivity[], now = new Date()) {
  const ageHours = Math.max(0, (now.getTime() - createdAt.getTime()) / HOUR_MS);
  const freshness = Math.log2(2 + Math.max(0, likes)) / (1 + ageHours / 24) ** 1.5;
  const participants = new Map<number, number>();
  for (const comment of comments) {
    const age = now.getTime() - comment.createdAt.getTime();
    if (age < 0 || age > ACTIVITY_WINDOW_MS) continue;
    const contribution = 2 ** (-age / (12 * HOUR_MS)) * (comment.authorId === authorId ? .25 : 1);
    // One person's repeated replies refresh their contribution, not multiply it.
    participants.set(comment.authorId, Math.max(participants.get(comment.authorId) ?? 0, contribution));
  }
  const activity = [...participants.values()].reduce((sum, contribution) => sum + contribution, 0);
  return freshness + .35 * Math.log2(1 + activity);
}

export async function loadPostCommentActivity(postIds: number[], now: Date) {
  const activity = new Map<number, CommentActivity[]>();
  if (!postIds.length) return activity;
  // Replies can store only commentId, so resolve their ancestors as well as
  // direct post comments. Count comment creation, never edits, as activity.
  const rows = await db.$queryRawUnsafe<Array<CommentActivity & { postId: number }>>(`
    WITH RECURSIVE thread AS (
      SELECT c.id, c."postId", c."commentId", c."authorId", c."createdAt", ARRAY[c.id] AS path
      FROM "Comment" c
      WHERE c."createdAt" >= $2 AND c."createdAt" <= $3
        AND c."deletedAt" IS NULL AND c."removedAt" IS NULL
        AND (c."postId" = ANY($1::int[]) OR (c."postId" IS NULL AND c."commentId" IS NOT NULL))
      UNION ALL
      SELECT p.id, COALESCE(t."postId", p."postId"), p."commentId", t."authorId", t."createdAt", t.path || p.id
      FROM thread t JOIN "Comment" p ON p.id = t."commentId"
      WHERE NOT (p.id = ANY(t.path)) AND p."deletedAt" IS NULL AND p."removedAt" IS NULL
    )
    SELECT DISTINCT ON ("postId", "authorId") "postId", "authorId", "createdAt"
    FROM thread WHERE "commentId" IS NULL AND "postId" = ANY($1::int[])
    ORDER BY "postId", "authorId", "createdAt" DESC
  `, postIds, new Date(now.getTime() - ACTIVITY_WINDOW_MS), now);
  for (const row of rows) {
    const entries = activity.get(row.postId) ?? [];
    entries.push(row);
    activity.set(row.postId, entries);
  }
  return activity;
}
