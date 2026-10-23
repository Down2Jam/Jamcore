CREATE TABLE "ContentView" (
  "tenantKey" TEXT NOT NULL DEFAULT '',
  "targetKey" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "identityHash" TEXT NOT NULL,
  "gameId" INTEGER NOT NULL,
  "trackId" INTEGER,
  "counted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentView_pkey" PRIMARY KEY ("tenantKey", "targetKey", "day", "identityHash"),
  CONSTRAINT "ContentView_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContentView_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "GamePageTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ContentView_tenantKey_gameId_trackId_day_counted_idx" ON "ContentView"("tenantKey", "gameId", "trackId", "day", "counted");
