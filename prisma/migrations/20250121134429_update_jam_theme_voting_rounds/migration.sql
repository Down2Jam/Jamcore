-- AlterTable
ALTER TABLE "Jam" ADD COLUMN     "noOfRounds" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "themePerRound" INTEGER NOT NULL DEFAULT 15;
