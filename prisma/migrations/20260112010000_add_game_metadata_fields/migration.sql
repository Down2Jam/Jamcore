-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "screenshots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trailerUrl" TEXT,
ADD COLUMN     "inputMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "estOneRun" TEXT,
ADD COLUMN     "estAnyPercent" TEXT,
ADD COLUMN     "estHundredPercent" TEXT;
