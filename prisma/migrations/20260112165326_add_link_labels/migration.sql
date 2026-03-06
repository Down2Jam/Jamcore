-- AlterTable
ALTER TABLE "User" ADD COLUMN     "linkLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];
