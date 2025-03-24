-- AlterTable
ALTER TABLE "RatingCategory" ADD COLUMN     "always" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;
