ALTER TABLE "Jam"
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "source_platform" TEXT;

ALTER TABLE "Game"
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "source_platform" TEXT;

CREATE UNIQUE INDEX "Jam_source_url_key" ON "Jam"("source_url");
CREATE UNIQUE INDEX "Game_source_url_key" ON "Game"("source_url");
