INSERT INTO "Flag" (
    "name",
    "description",
    "icon",
    "createdAt",
    "updatedAt"
)
SELECT
    new_flag.name,
    new_flag.description,
    new_flag.icon,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    VALUES
        ('Violence', 'Physical conflict or harm without visible blood or gore', 'swords'),
        ('Strong Language', 'Profanity, slurs, or other explicit language', 'messagecircle'),
        ('Gambling', 'Simulated betting, casino mechanics, or wagering', 'dice3'),
        ('Animal Harm', 'Violence, cruelty, or death involving animals', 'rabbit')
) AS new_flag(name, description, icon)
WHERE NOT EXISTS (
    SELECT 1
    FROM "Flag" AS existing_flag
    WHERE LOWER(existing_flag."name") = LOWER(new_flag.name)
);
