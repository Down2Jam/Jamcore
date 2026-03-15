ALTER TABLE "Track"
ADD COLUMN "allowBackgroundUseAttribution" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Track"
SET "allowBackgroundUseAttribution" = CASE
  WHEN UPPER(TRIM(COALESCE("license", ''))) = 'CC0' THEN false
  ELSE true
END;
