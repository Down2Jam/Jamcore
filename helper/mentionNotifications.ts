import db from "@helper/db";

const LOCAL_DOMAINS = new Set(["d2jam.com", "localhost", "127.0.0.1"]);

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/:\d+$/, "");
}

function isLocalDomain(domain?: string | null) {
  if (!domain) return true;
  return LOCAL_DOMAINS.has(normalizeDomain(domain));
}

export function extractMentionSlugs(content?: string | null): string[] {
  if (!content) return [];

  const slugs = new Set<string>();

  const tokenRegex =
    /(^|[^A-Za-z0-9_])@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:@([A-Za-z0-9.-]+))?/gi;
  for (const match of content.matchAll(tokenRegex)) {
    const slug = match[2]?.toLowerCase();
    const domain = match[3]?.toLowerCase();
    if (slug && isLocalDomain(domain)) {
      slugs.add(slug);
    }
  }

  const absoluteUrlRegex =
    /https?:\/\/([^/\s"'<>]+)\/u\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/gi;
  for (const match of content.matchAll(absoluteUrlRegex)) {
    const domain = match[1]?.toLowerCase();
    const slug = match[2]?.toLowerCase();
    if (slug && isLocalDomain(domain)) {
      slugs.add(slug);
    }
  }

  const relativeUrlRegex =
    /(?:href=(?:"|'))?\/u\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/gi;
  for (const match of content.matchAll(relativeUrlRegex)) {
    const slug = match[1]?.toLowerCase();
    if (slug) {
      slugs.add(slug);
    }
  }

  return Array.from(slugs);
}

type MentionNotificationContext =
  | {
      type: "post";
      actorId: number;
      actorName: string;
      actorSlug: string;
      beforeContent?: string | null;
      afterContent?: string | null;
      postId: number;
      postSlug: string;
      postTitle: string;
    }
  | {
      type: "comment";
      actorId: number;
      actorName: string;
      actorSlug: string;
      beforeContent?: string | null;
      afterContent?: string | null;
      commentId: number;
      postId?: number | null;
      postSlug?: string | null;
      postTitle?: string | null;
      gameId?: number | null;
      gameSlug?: string | null;
      gameName?: string | null;
    }
  | {
      type: "game";
      actorId: number;
      actorName: string;
      actorSlug: string;
      beforeContent?: string | null;
      afterContent?: string | null;
      gameId: number;
      gameSlug: string;
      gameName: string;
    }
  | {
      type: "profile";
      actorId: number;
      actorName: string;
      actorSlug: string;
      beforeContent?: string | null;
      afterContent?: string | null;
      profileSlug: string;
    };

function buildMentionNotification(context: MentionNotificationContext) {
  switch (context.type) {
    case "post":
      return {
        title: "Mention in post",
        body: `${context.actorName} mentioned you in a post: ${context.postTitle}`,
        link: `/p/${context.postSlug}`,
        postId: context.postId,
      };
    case "comment":
      if (context.postSlug) {
        return {
          title: "Mention in comment",
          body: `${context.actorName} mentioned you in a comment on post ${context.postTitle ?? context.postSlug}`,
          link: `/p/${context.postSlug}?comment=${context.commentId}#comment-${context.commentId}`,
          postId: context.postId ?? undefined,
          commentId: context.commentId,
        };
      }

      if (context.gameSlug) {
        return {
          title: "Mention in comment",
          body: `${context.actorName} mentioned you in a comment on game ${context.gameName ?? context.gameSlug}`,
          link: `/g/${context.gameSlug}?comment=${context.commentId}#comment-${context.commentId}`,
          gameId: context.gameId ?? undefined,
          commentId: context.commentId,
        };
      }

      return {
        title: "Mention in comment reply",
        body: `${context.actorName} mentioned you in a comment reply`,
        link: `#comment-${context.commentId}`,
        commentId: context.commentId,
      };
    case "game":
      return {
        title: "Mention in game",
        body: `${context.actorName} mentioned you in game ${context.gameName}`,
        link: `/g/${context.gameSlug}`,
        gameId: context.gameId,
      };
    case "profile":
      return {
        title: "Mention in profile",
        body: `${context.actorName} mentioned you in their profile bio`,
        link: `/u/${context.profileSlug}`,
      };
  }
}

export async function notifyNewMentions(context: MentionNotificationContext) {
  const previousMentions = new Set(extractMentionSlugs(context.beforeContent));
  const nextMentions = extractMentionSlugs(context.afterContent).filter(
    (slug) => !previousMentions.has(slug),
  );

  if (nextMentions.length === 0) return;

  const recipients = await db.user.findMany({
    where: {
      slug: { in: nextMentions },
      NOT: {
        id: context.actorId,
      },
    },
    select: {
      id: true,
    },
  });

  if (recipients.length === 0) return;

  const notification = buildMentionNotification(context);

  await db.notification.createMany({
    data: recipients.map((recipient) => ({
      type: "GENERAL" as const,
      actorId: context.actorId,
      recipientId: recipient.id,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      postId: "postId" in notification ? notification.postId ?? null : null,
      commentId:
        "commentId" in notification ? notification.commentId ?? null : null,
      gameId: "gameId" in notification ? notification.gameId ?? null : null,
    })),
  });
}

export async function resolveCommentMentionContext(commentId: number) {
  let currentCommentId: number | null = commentId;

  while (currentCommentId) {
    const comment = await db.comment.findUnique({
      where: { id: currentCommentId },
      select: {
        id: true,
        commentId: true,
        postId: true,
        gameId: true,
        post: {
          select: {
            id: true,
            slug: true,
            title: true,
          },
        },
        game: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!comment) break;

    if (comment.post) {
      return {
        postId: comment.post.id,
        postSlug: comment.post.slug,
        postTitle: comment.post.title,
      };
    }

    if (comment.game) {
      return {
        gameId: comment.game.id,
        gameSlug: comment.game.slug,
        gameName: comment.game.name,
      };
    }

    currentCommentId = comment.commentId;
  }

  return {};
}
