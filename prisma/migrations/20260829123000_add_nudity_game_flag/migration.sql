INSERT INTO "Flag" (
    "name",
    "description",
    "icon",
    "createdAt",
    "updatedAt"
)
SELECT
    'Nudity',
    'Partial or full nudity',
    'ban',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM "Flag"
    WHERE LOWER("name") = LOWER('Nudity')
);
