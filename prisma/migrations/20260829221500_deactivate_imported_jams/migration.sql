UPDATE "Jam"
SET "isActive" = FALSE
WHERE "source_platform" IS NOT NULL
  AND "isActive" = TRUE;
