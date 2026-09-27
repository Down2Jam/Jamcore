import { resolveCommentMentionContext } from "../mentions/notifications.service.js";

type NotificationLink = { link?: string | null; commentId?: number | null };

// Resolve old comment-only URLs when reading notifications, so existing rows
// work without rewriting stored notification history.
export async function repairCommentNotificationLinks(notifications: NotificationLink[]) {
  const resolved = new Map<number, Promise<string | null>>();
  for (const notification of notifications) {
    const legacy = notification.link?.match(/^\/comments\/(\d+)(?:[?#].*)?$/);
    const fragment = notification.link?.match(/^(?:\?comment=\d+)?#comment-(\d+)$/);
    const commentId = legacy || fragment
      ? Number((legacy ?? fragment)![1])
      : !notification.link ? notification.commentId : null;
    if (!commentId || !Number.isSafeInteger(commentId)) continue;

    let link = resolved.get(commentId);
    if (!link) {
      link = resolveCommentMentionContext(commentId).then((context) => {
        const page = context.postSlug ? `/p/${context.postSlug}`
          : context.trackSlug ? `/m/${context.trackSlug}`
            : context.gameSlug ? `/g/${context.gameSlug}` : null;
        return page ? `${page}?comment=${commentId}#comment-${commentId}` : null;
      });
      resolved.set(commentId, link);
    }
    notification.link = await link;
  }
}
