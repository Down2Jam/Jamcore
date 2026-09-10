CREATE TABLE "WebBuild" (
  "id" TEXT NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "archiveBytes" INTEGER NOT NULL,
  "expandedBytes" INTEGER NOT NULL,
  "fileCount" INTEGER NOT NULL,
  "scanned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  CONSTRAINT "WebBuild_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebBuild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WebBuild_ownerId_createdAt_idx" ON "WebBuild"("ownerId", "createdAt");
CREATE INDEX "WebBuild_claimedAt_createdAt_idx" ON "WebBuild"("claimedAt", "createdAt");
