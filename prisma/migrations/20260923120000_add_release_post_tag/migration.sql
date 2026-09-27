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
  'Release',
  'For posts announcing a game release',
  NULL,
  FALSE,
  'HIGH'::"Priority",
  FALSE,
  '/images/tag-icons/release.svg',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  category."id",
  FALSE,
  TRUE
FROM "TagCategory" AS category
WHERE category."name" = 'Development'
ON CONFLICT ("name") DO NOTHING;
