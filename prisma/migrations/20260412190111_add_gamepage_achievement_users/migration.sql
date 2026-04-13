-- DropForeignKey
ALTER TABLE "Data" DROP CONSTRAINT "Data_gamePageId_fkey";

-- DropForeignKey
ALTER TABLE "GamePage" DROP CONSTRAINT "GamePage_gameId_fkey";

-- DropForeignKey
ALTER TABLE "GamePageAchievement" DROP CONSTRAINT "GamePageAchievement_gamePageId_fkey";

-- DropForeignKey
ALTER TABLE "GamePageLeaderboard" DROP CONSTRAINT "GamePageLeaderboard_gamePageId_fkey";

-- DropForeignKey
ALTER TABLE "GamePageTrack" DROP CONSTRAINT "GamePageTrack_gamePageId_fkey";

-- DropForeignKey
ALTER TABLE "Ghost" DROP CONSTRAINT "Ghost_gamePageId_fkey";

-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_gamePageId_fkey";

-- AlterTable
ALTER TABLE "_GamePageToMajorityContentRating" ADD CONSTRAINT "_GamePageToMajorityContentRating_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_GamePageToMajorityContentRating_AB_unique";

-- AlterTable
ALTER TABLE "_GamePageToRatingCategory" ADD CONSTRAINT "_GamePageToRatingCategory_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_GamePageToRatingCategory_AB_unique";

-- AlterTable
ALTER TABLE "_GamePageTrackToTrackFlag" ADD CONSTRAINT "_GamePageTrackToTrackFlag_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_GamePageTrackToTrackFlag_AB_unique";

-- AlterTable
ALTER TABLE "_GamePageTrackToTrackTag" ADD CONSTRAINT "_GamePageTrackToTrackTag_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_GamePageTrackToTrackTag_AB_unique";

-- AlterTable
ALTER TABLE "_GamePagesToFlags" ADD CONSTRAINT "_GamePagesToFlags_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_GamePagesToFlags_AB_unique";

-- AlterTable
ALTER TABLE "_GamePagesToTags" ADD CONSTRAINT "_GamePagesToTags_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_GamePagesToTags_AB_unique";

-- CreateTable
CREATE TABLE "_GamePageAchievementToUsers" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_GamePageAchievementToUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_GamePageAchievementToUsers_B_index" ON "_GamePageAchievementToUsers"("B");

-- AddForeignKey
ALTER TABLE "GamePage" ADD CONSTRAINT "GamePage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_gamePageId_fkey" FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePageTrack" ADD CONSTRAINT "GamePageTrack_gamePageId_fkey" FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePageLeaderboard" ADD CONSTRAINT "GamePageLeaderboard_gamePageId_fkey" FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePageAchievement" ADD CONSTRAINT "GamePageAchievement_gamePageId_fkey" FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ghost" ADD CONSTRAINT "Ghost_gamePageId_fkey" FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Data" ADD CONSTRAINT "Data_gamePageId_fkey" FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GamePageAchievementToUsers" ADD CONSTRAINT "_GamePageAchievementToUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "GamePageAchievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GamePageAchievementToUsers" ADD CONSTRAINT "_GamePageAchievementToUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
