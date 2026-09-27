INSERT INTO "TagCategory" ("name", "priority", "createdAt", "updatedAt")
VALUES ('General', 9999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Tag" (
  "name", "description", "autoRegex", "alwaysAdded", "priority",
  "modOnly", "icon", "createdAt", "updatedAt", "categoryId", "gameTag", "postTag"
)
SELECT
  'JamRecap', 'For shared jam recaps', '\bjam[-\s]?recap\b', FALSE, 'HIGH'::"Priority",
  FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, "id", FALSE, TRUE
FROM "TagCategory"
WHERE "name" = 'General'
ON CONFLICT ("name") DO NOTHING;
