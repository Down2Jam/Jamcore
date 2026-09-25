INSERT INTO "Tag" (
  "name",
  "description",
  "autoRegex",
  "alwaysAdded",
  "priority",
  "modOnly",
  "icon",
  "createdAt",
  "updatedAt",
  "categoryId",
  "gameTag",
  "postTag"
)
SELECT
  'Favorites',
  'For posts sharing favorite games or music from a jam',
  NULL,
  FALSE,
  'HIGH'::"Priority",
  FALSE,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  category."id",
  FALSE,
  TRUE
FROM "TagCategory" AS category
WHERE category."name" = 'General'
ON CONFLICT ("name") DO NOTHING;
