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
  taxonomy."name",
  taxonomy."description",
  taxonomy."autoRegex",
  FALSE,
  taxonomy."priority"::"Priority",
  FALSE,
  taxonomy."icon",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  category."id",
  taxonomy."gameTag",
  TRUE
FROM (
  VALUES
    ('General', 'PostJam', 'For posts about work completed after a jam', '\bpost[-\s]?jam\b', 'HIGH', '/images/tag-icons/postjam.svg', FALSE),
    ('Music Software', 'FMOD', 'Audio made with FMOD', '\bfmod\b', 'MEDIUM', '/images/tag-icons/fmod.svg', TRUE),
    ('Music Software', 'Wwise', 'Audio made with Wwise', '\bwwise\b', 'MEDIUM', '/images/tag-icons/wwise.svg', TRUE)
) AS taxonomy(
  "category",
  "name",
  "description",
  "autoRegex",
  "priority",
  "icon",
  "gameTag"
)
JOIN "TagCategory" AS category ON category."name" = taxonomy."category"
ON CONFLICT ("name") DO NOTHING;
