/*
  Warnings:

  - You are about to drop the column `userId` on the `Achievement` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Achievement" DROP CONSTRAINT "Achievement_userId_fkey";

-- AlterTable
ALTER TABLE "Achievement" DROP COLUMN "userId";

-- CreateTable
CREATE TABLE "_AchievementToUsers" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_AchievementToUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AchievementToUsers_B_index" ON "_AchievementToUsers"("B");

-- AddForeignKey
ALTER TABLE "_AchievementToUsers" ADD CONSTRAINT "_AchievementToUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AchievementToUsers" ADD CONSTRAINT "_AchievementToUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
