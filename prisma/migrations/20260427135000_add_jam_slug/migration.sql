ALTER TABLE "Jam" ADD COLUMN "slug" TEXT;

WITH slug_bases AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        REGEXP_REPLACE(
          REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'),
          '(^-|-$)',
          '',
          'g'
        ),
        ''
      ),
      'jam'
    ) AS slug_base
  FROM "Jam"
),
slug_candidates AS (
  SELECT
    id,
    CASE
      WHEN ROW_NUMBER() OVER (PARTITION BY slug_base ORDER BY id) = 1
        THEN slug_base
      ELSE slug_base || '-' || ROW_NUMBER() OVER (PARTITION BY slug_base ORDER BY id)
    END AS slug
  FROM slug_bases
)
UPDATE "Jam" AS jam
SET "slug" = slug_candidates.slug
FROM slug_candidates
WHERE jam.id = slug_candidates.id;

ALTER TABLE "Jam" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Jam_slug_key" ON "Jam"("slug");
