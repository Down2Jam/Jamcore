-- Preserve JAM page presentation fields on GamePage before removing the legacy
-- copies from Game, and preserve category on Game before dropping it from GamePage.
UPDATE "GamePage" AS gp
SET
  "name" = CASE
    WHEN NULLIF(BTRIM(gp."name"), '') IS NULL THEN g."name"
    ELSE gp."name"
  END,
  "short" = COALESCE(gp."short", g."short"),
  "thumbnail" = COALESCE(gp."thumbnail", g."thumbnail"),
  "itchEmbedUrl" = COALESCE(gp."itchEmbedUrl", g."itchEmbedUrl"),
  "emotePrefix" = COALESCE(gp."emotePrefix", g."emotePrefix")
FROM "Game" AS g
WHERE
  gp."gameId" = g."id"
  AND gp."version" = 'JAM';

UPDATE "Game" AS g
SET "category" = gp."category"
FROM "GamePage" AS gp
WHERE
  gp."gameId" = g."id"
  AND gp."version" = 'JAM'
  AND gp."category" IS NOT NULL;

ALTER TABLE "Game"
  DROP COLUMN "name",
  DROP COLUMN "short",
  DROP COLUMN "thumbnail",
  DROP COLUMN "itchEmbedUrl",
  DROP COLUMN "emotePrefix";

ALTER TABLE "GamePage"
  DROP COLUMN "category";
