-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "bpm" INTEGER,
ADD COLUMN     "musicalKey" TEXT,
ADD COLUMN     "softwareUsed" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "TrackTagCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackTagCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackTag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "TrackTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackFlag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackLink" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trackId" INTEGER NOT NULL,

    CONSTRAINT "TrackLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackCredit" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trackId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "TrackCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TrackToTrackTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_TrackToTrackTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TrackToTrackFlag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_TrackToTrackFlag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackTagCategory_name_key" ON "TrackTagCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TrackTag_name_key" ON "TrackTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TrackFlag_name_key" ON "TrackFlag"("name");

-- CreateIndex
CREATE INDEX "_TrackToTrackTag_B_index" ON "_TrackToTrackTag"("B");

-- CreateIndex
CREATE INDEX "_TrackToTrackFlag_B_index" ON "_TrackToTrackFlag"("B");

-- AddForeignKey
ALTER TABLE "TrackTag" ADD CONSTRAINT "TrackTag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TrackTagCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackLink" ADD CONSTRAINT "TrackLink_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackCredit" ADD CONSTRAINT "TrackCredit_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackCredit" ADD CONSTRAINT "TrackCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TrackToTrackTag" ADD CONSTRAINT "_TrackToTrackTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TrackToTrackTag" ADD CONSTRAINT "_TrackToTrackTag_B_fkey" FOREIGN KEY ("B") REFERENCES "TrackTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TrackToTrackFlag" ADD CONSTRAINT "_TrackToTrackFlag_A_fkey" FOREIGN KEY ("A") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TrackToTrackFlag" ADD CONSTRAINT "_TrackToTrackFlag_B_fkey" FOREIGN KEY ("B") REFERENCES "TrackFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
