ALTER TABLE "Game" ADD COLUMN "published_at" TIMESTAMP(3);

UPDATE "Game" AS game
SET "published_at" = jam."startTime"
  + (jam."jammingHours" + jam."submissionHours") * INTERVAL '1 hour'
FROM "Jam" AS jam
WHERE game."jamId" = jam.id
  AND game."published" = true;

CREATE INDEX "Game_published_published_at_idx"
ON "Game"("published", "published_at");
