ALTER TABLE "GamePage"
  ADD COLUMN "playableBuildAspectRatio" TEXT,
  ADD COLUMN "playableBuildId" TEXT;

ALTER TABLE "WebBuild"
  ADD COLUMN "deleteAfter" TIMESTAMP(3);

UPDATE "GamePage"
SET "playableBuildAspectRatio" = "itchEmbedAspectRatio"
WHERE "playableBuildUrl" IS NOT NULL;

UPDATE "GamePage" AS page
SET "playableBuildId" = build.id
FROM "WebBuild" AS build
WHERE page."playableBuildUrl" = '/game-builds/' || build.id || '/index.html';

CREATE INDEX "GamePage_playableBuildId_idx" ON "GamePage"("playableBuildId");
CREATE INDEX "WebBuild_deleteAfter_idx" ON "WebBuild"("deleteAfter");

ALTER TABLE "GamePage"
  ADD CONSTRAINT "GamePage_playableBuildId_fkey"
  FOREIGN KEY ("playableBuildId") REFERENCES "WebBuild"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
