import { z } from "zod";

import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

const MAX_GROUP_RECIPIENTS = 19;

type MessageActor = {
  id: number;
  tenantId?: string | null;
};

export const conversationIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listConversationsSchema = z.object({
  box: z.enum(["messages", "requests", "archived"]).optional().default("messages"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().datetime().optional(),
});

export const listMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.coerce.number().int().positive().optional(),
});

export const createConversationSchema = z.object({
  recipientSlugs: z
    .array(z.string().trim().min(1).max(64))
    .min(1)
    .max(MAX_GROUP_RECIPIENTS),
  name: z.string().trim().min(1).max(80).optional().nullable(),
  body: z.string().trim().min(1).max(4000),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const conversationActionSchema = z.object({
  action: z.enum([
    "accept",
    "decline",
    "read",
    "archive",
    "unarchive",
    "mute",
    "unmute",
  ]),
});

const userSummarySelect = {
  id: true,
  slug: true,
  name: true,
  profilePicture: true,
} as const;

const conversationInclude = {
  members: {
    include: { user: { select: userSummarySelect } },
    orderBy: { createdAt: "asc" as const },
  },
  messages: {
    where: { deletedAt: null },
    include: { sender: { select: userSummarySelect } },
    orderBy: { id: "desc" as const },
    take: 1,
  },
} as const;

async function getMembership(conversationId: number, userId: number) {
  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: {
      conversation: { include: conversationInclude },
    },
  });
  if (!membership) throw new NotFoundError("Conversation not found");
  return membership;
}

function visibleConversationForBox(
  membership: Awaited<ReturnType<typeof getMembership>>,
  box: "messages" | "requests" | "archived",
) {
  if (box === "archived") return Boolean(membership.archivedAt);
  if (membership.archivedAt) return false;

  const hasAnotherAcceptedMember = membership.conversation.members.some(
    (member) => member.userId !== membership.userId && member.status === "ACCEPTED",
  );
  const isRequest =
    membership.status === "PENDING" ||
    (membership.status === "ACCEPTED" && !hasAnotherAcceptedMember);
  return box === "requests" ? isRequest : membership.status === "ACCEPTED" && !isRequest;
}

async function unreadCountForMembership(
  conversationId: number,
  userId: number,
  lastReadMessageId: number | null,
) {
  return db.conversationMessage.count({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      ...(lastReadMessageId ? { id: { gt: lastReadMessageId } } : {}),
    },
  });
}

async function presentConversation(
  membership: Awaited<ReturnType<typeof getMembership>>,
) {
  const unreadCount = await unreadCountForMembership(
    membership.conversationId,
    membership.userId,
    membership.lastReadMessageId,
  );
  const hasAnotherAcceptedMember = membership.conversation.members.some(
    (member) => member.userId !== membership.userId && member.status === "ACCEPTED",
  );
  return {
    ...membership.conversation,
    latestMessage: membership.conversation.messages[0] ?? null,
    messages: undefined,
    membership: {
      status: membership.status,
      role: membership.role,
      mutedAt: membership.mutedAt,
      archivedAt: membership.archivedAt,
    },
    requestDirection:
      membership.status === "PENDING"
        ? "incoming"
        : !hasAnotherAcceptedMember
          ? "outgoing"
          : null,
    unreadCount,
  };
}

export async function listConversations({
  actor,
  input,
}: {
  actor: MessageActor;
  input: z.infer<typeof listConversationsSchema>;
}) {
  const memberships = await db.conversationMember.findMany({
    where: {
      userId: actor.id,
      status: { not: "DECLINED" },
      ...(input.cursor
        ? { conversation: { lastMessageAt: { lt: new Date(input.cursor) } } }
        : {}),
    },
    include: { conversation: { include: conversationInclude } },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: input.limit * 2,
  });

  const selected = memberships
    .filter((membership) => visibleConversationForBox(membership, input.box))
    .slice(0, input.limit);
  return Promise.all(selected.map(presentConversation));
}

async function assertRequestAllowed(senderId: number, recipient: {
  id: number;
  messageRequestPolicy: "EVERYONE" | "FOLLOWING" | "NOBODY";
  tenantId: string | null;
}) {
  if (recipient.messageRequestPolicy === "NOBODY") {
    throw new ForbiddenError("This user is not accepting message requests");
  }
  if (recipient.messageRequestPolicy === "FOLLOWING") {
    const followsSender = await db.userFollow.findFirst({
      where: {
        followerId: recipient.id,
        followingId: senderId,
        tenantId: recipient.tenantId,
      },
      select: { followerId: true },
    });
    if (!followsSender) {
      throw new ForbiddenError("This user only accepts requests from people they follow");
    }
  }
}

async function assertNotBlocked(userIds: number[]) {
  const block = await db.userBlock.findFirst({
    where: {
      OR: userIds.flatMap((left, index) =>
        userIds.slice(index + 1).flatMap((right) => [
          { blockerId: left, blockedId: right },
          { blockerId: right, blockedId: left },
        ]),
      ),
    },
    select: { blockerId: true },
  });
  if (block) throw new ForbiddenError("A blocked user cannot be added to this conversation");
}

async function findDirectConversation(firstUserId: number, secondUserId: number) {
  const candidates = await db.conversation.findMany({
    where: {
      type: "DIRECT",
      AND: [
        { members: { some: { userId: firstUserId } } },
        { members: { some: { userId: secondUserId } } },
      ],
    },
    include: { members: true },
  });
  return candidates.find(
    (conversation) =>
      conversation.members.length === 2 &&
      conversation.members.every((member) =>
        [firstUserId, secondUserId].includes(member.userId),
      ),
  );
}

export async function createConversation({
  actor,
  input,
  tenantId,
}: {
  actor: MessageActor;
  input: z.infer<typeof createConversationSchema>;
  tenantId?: string | null;
}) {
  const slugs = [...new Set(input.recipientSlugs.map((slug) => slug.toLowerCase()))];
  const candidateRecipients = await db.user.findMany({
    where: {
      slug: { in: slugs, mode: "insensitive" },
      id: { not: actor.id },
    },
    select: {
      id: true,
      slug: true,
      messageRequestPolicy: true,
      tenantId: true,
    },
  });
  const allowedRecipientIds = await filterCoreEntityIdsByTenant({
    entityType: "User",
    ids: candidateRecipients.map((recipient) => recipient.id),
    tenantId,
  });
  const recipients = candidateRecipients.filter((recipient) =>
    allowedRecipientIds.includes(recipient.id),
  );
  if (recipients.length !== slugs.length) {
    throw new BadRequestError("One or more recipients could not be found");
  }

  await assertNotBlocked([actor.id, ...recipients.map((recipient) => recipient.id)]);
  await Promise.all(
    recipients.map((recipient) => assertRequestAllowed(actor.id, recipient)),
  );

  if (recipients.length === 1) {
    const existing = await findDirectConversation(actor.id, recipients[0].id);
    if (existing) {
      const actorMembership = existing.members.find((member) => member.userId === actor.id);
      const otherMembership = existing.members.find((member) => member.userId !== actor.id);
      if (actorMembership?.status === "ACCEPTED" && otherMembership?.status === "ACCEPTED") {
        await sendMessage({
          actor,
          conversationId: existing.id,
          input: { body: input.body },
        });
        return presentConversation(await getMembership(existing.id, actor.id));
      }
      throw new ConflictError("A message request already exists for this user");
    }
  }

  const conversation = await db.$transaction(async (tx) => {
    if (recipients.length === 1) {
      const pair = [actor.id, recipients[0].id].sort((left, right) => left - right);
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock($1::int, $2::int)",
        pair[0],
        pair[1],
      );
      const duplicates = (await tx.$queryRawUnsafe(
        `
          SELECT c.id
          FROM "Conversation" c
          JOIN "ConversationMember" first_member ON first_member."conversationId" = c.id AND first_member."userId" = $1
          JOIN "ConversationMember" second_member ON second_member."conversationId" = c.id AND second_member."userId" = $2
          WHERE c.type = 'DIRECT'
            AND (SELECT COUNT(*) FROM "ConversationMember" member_count WHERE member_count."conversationId" = c.id) = 2
          LIMIT 1
        `,
        actor.id,
        recipients[0].id,
      )) as Array<{ id: number }>;
      if (duplicates.length) throw new ConflictError("A conversation already exists for this user");
    }
    const created = await tx.conversation.create({
      data: {
        type: recipients.length === 1 ? "DIRECT" : "GROUP",
        name: recipients.length > 1 ? input.name?.trim() || null : null,
        createdById: actor.id,
        tenantId: tenantId ?? null,
        members: {
          create: [
            {
              userId: actor.id,
              role: "OWNER",
              status: "ACCEPTED",
              joinedAt: new Date(),
            },
            ...recipients.map((recipient) => ({
              userId: recipient.id,
              invitedById: actor.id,
              role: "MEMBER" as const,
              status: "PENDING" as const,
            })),
          ],
        },
      },
    });
    const message = await tx.conversationMessage.create({
      data: {
        conversationId: created.id,
        senderId: actor.id,
        body: input.body.trim(),
      },
    });
    await tx.conversationMember.updateMany({
      where: { conversationId: created.id, status: "PENDING" },
      data: { requestMessageId: message.id },
    });
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId: created.id, userId: actor.id } },
      data: { lastReadMessageId: message.id },
    });
    await tx.conversation.update({
      where: { id: created.id },
      data: { lastMessageAt: message.createdAt },
    });
    return created;
  });

  return presentConversation(await getMembership(conversation.id, actor.id));
}

export async function getConversationMessages({
  actor,
  conversationId,
  input,
}: {
  actor: MessageActor;
  conversationId: number;
  input: z.infer<typeof listMessagesSchema>;
}) {
  const membership = await getMembership(conversationId, actor.id);
  if (membership.status === "DECLINED") throw new NotFoundError("Conversation not found");
  const messages = await db.conversationMessage.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(membership.status === "PENDING"
        ? { id: membership.requestMessageId ?? -1 }
        : {}),
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
    },
    include: { sender: { select: userSummarySelect } },
    orderBy: { id: "desc" },
    take: input.limit,
  });
  return {
    conversation: await presentConversation(membership),
    messages: messages.reverse(),
  };
}

export async function sendMessage({
  actor,
  conversationId,
  input,
}: {
  actor: MessageActor;
  conversationId: number;
  input: z.infer<typeof sendMessageSchema>;
}) {
  const membership = await getMembership(conversationId, actor.id);
  if (membership.status !== "ACCEPTED") {
    throw new ForbiddenError("Accept this conversation before replying");
  }
  const acceptedOthers = membership.conversation.members.filter(
    (member) => member.userId !== actor.id && member.status === "ACCEPTED",
  );
  if (acceptedOthers.length === 0) {
    throw new ConflictError("Wait for someone to accept this request before sending again");
  }
  if (membership.conversation.type === "DIRECT") {
    await assertNotBlocked([actor.id, acceptedOthers[0].userId]);
  }
  const message = await db.$transaction(async (tx) => {
    const created = await tx.conversationMessage.create({
      data: { conversationId, senderId: actor.id, body: input.body.trim() },
      include: { sender: { select: userSummarySelect } },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: created.createdAt },
    });
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data: { lastReadMessageId: created.id, archivedAt: null },
    });
    return created;
  });
  return message;
}

export async function updateConversation({
  actor,
  conversationId,
  action,
}: {
  actor: MessageActor;
  conversationId: number;
  action: z.infer<typeof conversationActionSchema>["action"];
}) {
  const membership = await getMembership(conversationId, actor.id);
  if (action === "accept") {
    if (membership.status !== "PENDING") throw new ConflictError("Request is not pending");
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data: { status: "ACCEPTED", joinedAt: new Date(), archivedAt: null },
    });
  } else if (action === "decline") {
    if (membership.status !== "PENDING") throw new ConflictError("Request is not pending");
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data: { status: "DECLINED", archivedAt: new Date() },
    });
  } else if (action === "read") {
    const latest = await db.conversationMessage.findFirst({
      where: { conversationId, deletedAt: null },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data: { lastReadMessageId: latest?.id ?? null },
    });
  } else {
    const data =
      action === "archive"
        ? { archivedAt: new Date() }
        : action === "unarchive"
          ? { archivedAt: null }
          : action === "mute"
            ? { mutedAt: new Date() }
            : { mutedAt: null };
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data,
    });
  }
  return presentConversation(await getMembership(conversationId, actor.id));
}

export async function getMessageCounts(actor: MessageActor) {
  const memberships = await db.conversationMember.findMany({
    where: { userId: actor.id, status: { not: "DECLINED" }, archivedAt: null },
    include: { conversation: { include: { members: true } } },
  });
  let unreadMessages = 0;
  let requests = 0;
  for (const membership of memberships) {
    const hasAnotherAcceptedMember = membership.conversation.members.some(
      (member) => member.userId !== actor.id && member.status === "ACCEPTED",
    );
    if (membership.status === "PENDING") {
      requests += 1;
    } else if (membership.status === "ACCEPTED" && hasAnotherAcceptedMember) {
      unreadMessages += await unreadCountForMembership(
        membership.conversationId,
        actor.id,
        membership.lastReadMessageId,
      );
    }
  }
  return { unreadMessages, requests, total: unreadMessages + requests };
}

export async function blockUser({ actor, targetSlug }: { actor: MessageActor; targetSlug: string }) {
  const target = await db.user.findUnique({ where: { slug: targetSlug }, select: { id: true } });
  if (!target) throw new NotFoundError("User not found");
  if (target.id === actor.id) throw new BadRequestError("You cannot block yourself");
  await db.$transaction([
    db.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: actor.id, blockedId: target.id } },
      create: { blockerId: actor.id, blockedId: target.id },
      update: {},
    }),
    db.conversationMember.updateMany({
      where: {
        userId: actor.id,
        status: "PENDING",
        conversation: { members: { some: { userId: target.id } } },
      },
      data: { status: "DECLINED", archivedAt: new Date() },
    }),
    db.userFollow.deleteMany({
      where: {
        OR: [
          { followerId: actor.id, followingId: target.id },
          { followerId: target.id, followingId: actor.id },
        ],
      },
    }),
  ]);
  return { blocked: true };
}

export async function unblockUser({ actor, targetSlug }: { actor: MessageActor; targetSlug: string }) {
  const target = await db.user.findUnique({ where: { slug: targetSlug }, select: { id: true } });
  if (!target) throw new NotFoundError("User not found");
  await db.userBlock.deleteMany({ where: { blockerId: actor.id, blockedId: target.id } });
  return { blocked: false };
}
