ALTER TABLE "Track"
ADD COLUMN "allowBackgroundUse" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Track"
SET "allowBackgroundUse" = true
WHERE UPPER(REGEXP_REPLACE(COALESCE("license", ''), '\s+', ' ', 'g')) IN ('CC0', 'CC BY');
