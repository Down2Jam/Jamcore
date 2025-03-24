-- AlterTable
ALTER TABLE "RatingCategory" ADD COLUMN     "askMajorityContent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "_GameToMajorityContentRating" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_GameToMajorityContentRating_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_GameToMajorityContentRating_B_index" ON "_GameToMajorityContentRating"("B");

-- AddForeignKey
ALTER TABLE "_GameToMajorityContentRating" ADD CONSTRAINT "_GameToMajorityContentRating_A_fkey" FOREIGN KEY ("A") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GameToMajorityContentRating" ADD CONSTRAINT "_GameToMajorityContentRating_B_fkey" FOREIGN KEY ("B") REFERENCES "RatingCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
