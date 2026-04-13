-- Backfill any missing JAM page metadata from legacy Game columns before dropping them.
UPDATE "GamePage" AS gp
SET
  "description" = COALESCE(gp."description", g."description"),
  "banner" = COALESCE(gp."banner", g."banner"),
  "screenshots" = CASE
    WHEN COALESCE(array_length(gp."screenshots", 1), 0) = 0 THEN g."screenshots"
    ELSE gp."screenshots"
  END,
  "trailerUrl" = COALESCE(gp."trailerUrl", g."trailerUrl"),
  "itchEmbedAspectRatio" = COALESCE(gp."itchEmbedAspectRatio", g."itchEmbedAspectRatio"),
  "inputMethods" = CASE
    WHEN COALESCE(array_length(gp."inputMethods", 1), 0) = 0 THEN g."inputMethods"
    ELSE gp."inputMethods"
  END,
  "estOneRun" = COALESCE(gp."estOneRun", g."estOneRun"),
  "estAnyPercent" = COALESCE(gp."estAnyPercent", g."estAnyPercent"),
  "estHundredPercent" = COALESCE(gp."estHundredPercent", g."estHundredPercent"),
  "themeJustification" = COALESCE(gp."themeJustification", g."themeJustification")
FROM "Game" AS g
WHERE
  gp."gameId" = g."id"
  AND gp."version" = 'JAM';

ALTER TABLE "Game"
  DROP COLUMN "description",
  DROP COLUMN "banner",
  DROP COLUMN "screenshots",
  DROP COLUMN "trailerUrl",
  DROP COLUMN "itchEmbedAspectRatio",
  DROP COLUMN "inputMethods",
  DROP COLUMN "estOneRun",
  DROP COLUMN "estAnyPercent",
  DROP COLUMN "estHundredPercent",
  DROP COLUMN "themeJustification";
