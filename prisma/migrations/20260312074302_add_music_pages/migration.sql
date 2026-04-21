-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TRACK_COMMENT';

-- DropForeignKey
ALTER TABLE "_UserRecommendedGames" DROP CONSTRAINT "_UserRecommendedGames_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserRecommendedGames" DROP CONSTRAINT "_UserRecommendedGames_B_fkey";

-- DropForeignKey
ALTER TABLE "_UserRecommendedPosts" DROP CONSTRAINT "_UserRecommendedPosts_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserRecommendedPosts" DROP CONSTRAINT "_UserRecommendedPosts_B_fkey";

-- DropForeignKey
ALTER TABLE "_UserRecommendedTracks" DROP CONSTRAINT "_UserRecommendedTracks_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserRecommendedTracks" DROP CONSTRAINT "_UserRecommendedTracks_B_fkey";

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "trackId" INTEGER;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "trackId" INTEGER;

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "commentary" TEXT;

-- AlterTable
ALTER TABLE "_UserRecommendedGames" ADD CONSTRAINT "_UserRecommendedGames_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_UserRecommendedGames_AB_unique";

-- AlterTable
ALTER TABLE "_UserRecommendedPosts" ADD CONSTRAINT "_UserRecommendedPosts_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_UserRecommendedPosts_AB_unique";

-- AlterTable
ALTER TABLE "_UserRecommendedTracks" ADD CONSTRAINT "_UserRecommendedTracks_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_UserRecommendedTracks_AB_unique";

-- CreateTable
CREATE TABLE "TrackRatingCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "always" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackRatingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackRating" (
    "id" SERIAL NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,

    CONSTRAINT "TrackRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackRatingCategory_name_key" ON "TrackRatingCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TrackRating_trackId_categoryId_userId_key" ON "TrackRating"("trackId", "categoryId", "userId");

-- CreateIndex
CREATE INDEX "Notification_trackId_idx" ON "Notification"("trackId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackRating" ADD CONSTRAINT "TrackRating_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TrackRatingCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackRating" ADD CONSTRAINT "TrackRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackRating" ADD CONSTRAINT "TrackRating_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRecommendedPosts" ADD CONSTRAINT "_UserRecommendedPosts_A_fkey" FOREIGN KEY ("A") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRecommendedPosts" ADD CONSTRAINT "_UserRecommendedPosts_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRecommendedGames" ADD CONSTRAINT "_UserRecommendedGames_A_fkey" FOREIGN KEY ("A") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRecommendedGames" ADD CONSTRAINT "_UserRecommendedGames_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRecommendedTracks" ADD CONSTRAINT "_UserRecommendedTracks_A_fkey" FOREIGN KEY ("A") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRecommendedTracks" ADD CONSTRAINT "_UserRecommendedTracks_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
