/*
  Warnings:

  - You are about to drop the column `gameId` on the `Score` table. All the data in the column will be lost.
  - Added the required column `evidence` to the `Score` table without a default value. This is not possible if the table is not empty.
  - Added the required column `leaderboardId` to the `Score` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `data` on the `Score` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "LeaderboardType" AS ENUM ('SCORE', 'GOLF', 'SPEEDRUN', 'ENDURANCE');

-- DropForeignKey
ALTER TABLE "Score" DROP CONSTRAINT "Score_gameId_fkey";

-- AlterTable
ALTER TABLE "Score" DROP COLUMN "gameId",
ADD COLUMN     "evidence" TEXT NOT NULL,
ADD COLUMN     "leaderboardId" INTEGER NOT NULL,
DROP COLUMN "data",
ADD COLUMN     "data" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Leaderboard" (
    "id" SERIAL NOT NULL,
    "type" "LeaderboardType" NOT NULL,
    "name" TEXT NOT NULL,
    "onlyBest" BOOLEAN NOT NULL DEFAULT true,
    "gameId" INTEGER NOT NULL,

    CONSTRAINT "Leaderboard_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Leaderboard" ADD CONSTRAINT "Leaderboard_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_leaderboardId_fkey" FOREIGN KEY ("leaderboardId") REFERENCES "Leaderboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
