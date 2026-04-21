ALTER TABLE "Score" DROP CONSTRAINT "Score_leaderboardId_fkey";

UPDATE "Score" s
SET "leaderboardId" = gpl."id"
FROM "Leaderboard" lb
JOIN "GamePage" gp
  ON gp."gameId" = lb."gameId"
 AND gp."version" = 'JAM'
JOIN "GamePageLeaderboard" gpl
  ON gpl."gamePageId" = gp."id"
 AND gpl."name" = lb."name"
 AND gpl."type" = lb."type"
 AND gpl."onlyBest" = lb."onlyBest"
 AND gpl."maxUsersShown" = lb."maxUsersShown"
 AND gpl."decimalPlaces" = lb."decimalPlaces"
WHERE s."leaderboardId" = lb."id";

ALTER TABLE "Score"
ADD CONSTRAINT "Score_leaderboardId_fkey"
FOREIGN KEY ("leaderboardId")
REFERENCES "GamePageLeaderboard"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

DROP TABLE "Leaderboard";
