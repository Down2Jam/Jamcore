/*
  Warnings:

  - You are about to drop the `GameTag` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_GamesToTags" DROP CONSTRAINT "_GamesToTags_B_fkey";

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "gameTag" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "postTag" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "GameTag";

-- AddForeignKey
ALTER TABLE "_GamesToTags" ADD CONSTRAINT "_GamesToTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
