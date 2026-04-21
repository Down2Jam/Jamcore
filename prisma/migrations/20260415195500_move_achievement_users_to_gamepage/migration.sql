INSERT INTO "_GamePageAchievementToUsers" ("A", "B")
SELECT DISTINCT gpa."id", atu."B"
FROM "_AchievementToUsers" atu
JOIN "Achievement" a ON a."id" = atu."A"
JOIN "GamePage" gp
  ON gp."gameId" = a."gameId"
 AND gp."version" = 'JAM'
JOIN "GamePageAchievement" gpa
  ON gpa."gamePageId" = gp."id"
 AND gpa."name" = a."name"
 AND COALESCE(gpa."description", '') = COALESCE(a."description", '')
 AND COALESCE(gpa."image", '') = COALESCE(a."image", '')
ON CONFLICT ("A", "B") DO NOTHING;

DROP TABLE "_AchievementToUsers";
DROP TABLE "Achievement";
