CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "ConversationMemberStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
CREATE TYPE "ConversationMemberRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "MessageRequestPolicy" AS ENUM ('EVERYONE', 'FOLLOWING', 'NOBODY');

ALTER TABLE "User"
ADD COLUMN "messageRequestPolicy" "MessageRequestPolicy" NOT NULL DEFAULT 'EVERYONE';

CREATE TABLE "Conversation" (
  "id" SERIAL NOT NULL,
  "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
  "name" TEXT,
  "createdById" INTEGER NOT NULL,
  "tenant_id" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationMessage" (
  "id" SERIAL NOT NULL,
  "conversation_id" INTEGER NOT NULL,
  "sender_id" INTEGER NOT NULL,
  "body" VARCHAR(4000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationMember" (
  "conversationId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "invited_by_id" INTEGER,
  "status" "ConversationMemberStatus" NOT NULL DEFAULT 'PENDING',
  "role" "ConversationMemberRole" NOT NULL DEFAULT 'MEMBER',
  "request_message_id" INTEGER,
  "last_read_message_id" INTEGER,
  "muted_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "joined_at" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("conversationId", "userId")
);

CREATE TABLE "UserBlock" (
  "blocker_id" INTEGER NOT NULL,
  "blocked_id" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blocker_id", "blocked_id")
);

ALTER TABLE "Report" ADD COLUMN "direct_message_id" INTEGER;

CREATE INDEX "Conversation_tenant_id_last_message_at_idx" ON "Conversation"("tenant_id", "last_message_at");
CREATE INDEX "Conversation_createdById_last_message_at_idx" ON "Conversation"("createdById", "last_message_at");
CREATE INDEX "ConversationMember_userId_status_archived_at_idx" ON "ConversationMember"("userId", "status", "archived_at");
CREATE INDEX "ConversationMessage_conversation_id_createdAt_idx" ON "ConversationMessage"("conversation_id", "createdAt");
CREATE INDEX "ConversationMessage_sender_id_createdAt_idx" ON "ConversationMessage"("sender_id", "createdAt");
CREATE INDEX "UserBlock_blocked_id_blocker_id_idx" ON "UserBlock"("blocked_id", "blocker_id");
CREATE INDEX "Report_direct_message_id_idx" ON "Report"("direct_message_id");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_request_message_id_fkey"
  FOREIGN KEY ("request_message_id") REFERENCES "ConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_last_read_message_id_fkey"
  FOREIGN KEY ("last_read_message_id") REFERENCES "ConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blocker_id_fkey"
  FOREIGN KEY ("blocker_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blocked_id_fkey"
  FOREIGN KEY ("blocked_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_direct_message_id_fkey"
  FOREIGN KEY ("direct_message_id") REFERENCES "ConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_no_self_block" CHECK ("blocker_id" <> "blocked_id");
