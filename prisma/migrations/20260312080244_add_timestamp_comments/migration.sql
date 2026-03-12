-- CreateTable
CREATE TABLE "TrackTimestampComment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,

    CONSTRAINT "TrackTimestampComment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TrackTimestampComment" ADD CONSTRAINT "TrackTimestampComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackTimestampComment" ADD CONSTRAINT "TrackTimestampComment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
