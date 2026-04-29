import db from "../../infra/db.js";
import logger from "../../infra/logger.js";
import {
  publishPost,
} from "./service.js";

async function publishDueScheduledPosts() {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        p.id,
        u.id AS "authorId",
        u.slug AS "authorSlug",
        u.name AS "authorName",
        u.mod,
        u.admin,
        p.tenant_id AS "tenantId"
      FROM "Post" p
      JOIN "User" u ON u.id = p."authorId"
      WHERE p.draft_status = 'scheduled'
        AND p.scheduled_publish_at <= NOW()
        AND p."deletedAt" IS NULL
        AND p."removedAt" IS NULL
      ORDER BY p.scheduled_publish_at ASC
      LIMIT 20
    `,
  )) as Array<{
    id: number;
    authorId: number;
    authorSlug: string;
    authorName: string;
    mod: boolean;
    admin: boolean;
    tenantId: string | null;
  }>;

  for (const row of rows) {
    try {
      await publishPost({
        actor: {
          id: row.authorId,
          slug: row.authorSlug,
          name: row.authorName,
          mod: row.mod,
          admin: row.admin,
        },
        input: { postId: row.id },
        tenantId: row.tenantId,
      });
    } catch (error) {
      logger.warn("Failed to publish scheduled post", {
        postId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function startScheduledPostPublisherRuntime() {
  const interval = setInterval(() => {
    void publishDueScheduledPosts();
  }, 30_000);

  void publishDueScheduledPosts();

  return {
    name: "scheduled-post-publisher",
    stop() {
      clearInterval(interval);
    },
  };
}
