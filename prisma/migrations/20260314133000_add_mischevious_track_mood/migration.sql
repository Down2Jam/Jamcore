INSERT INTO "TrackTag" ("name", "description", "icon", "createdAt", "updatedAt", "categoryId")
SELECT
  'Mischevious',
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  category."id"
FROM "TrackTagCategory" AS category
WHERE category."name" = 'Mood'
  AND NOT EXISTS (
    SELECT 1
    FROM "TrackTag" AS tag
    WHERE tag."name" = 'Mischevious'
  );
