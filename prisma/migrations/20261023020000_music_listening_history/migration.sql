CREATE TABLE "MusicListen" (
  "eventId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tenantKey" TEXT NOT NULL DEFAULT '',
  "trackId" INTEGER NOT NULL REFERENCES "GamePageTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "tenantKey", "eventId")
);
CREATE INDEX "MusicListen_userId_tenantKey_playedAt_idx" ON "MusicListen"("userId", "tenantKey", "playedAt");
