ALTER TABLE "GamePageTrack" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GamePageLeaderboard" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Preserve creation order for existing pages before owners customize it.
WITH positions AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "gamePageId" ORDER BY "id") - 1 AS position
  FROM "GamePageTrack"
)
UPDATE "GamePageTrack" AS item SET "sortOrder" = positions.position
FROM positions WHERE item."id" = positions."id";

WITH positions AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "gamePageId" ORDER BY "id") - 1 AS position
  FROM "GamePageLeaderboard"
)
UPDATE "GamePageLeaderboard" AS item SET "sortOrder" = positions.position
FROM positions WHERE item."id" = positions."id";
