-- DropForeignKey
ALTER TABLE "PostReaction" DROP CONSTRAINT "PostReaction_postId_fkey";

-- DropForeignKey
ALTER TABLE "PostReaction" DROP CONSTRAINT "PostReaction_reactionId_fkey";

-- DropForeignKey
ALTER TABLE "PostReaction" DROP CONSTRAINT "PostReaction_userId_fkey";

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_reactionId_fkey" FOREIGN KEY ("reactionId") REFERENCES "Reaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
