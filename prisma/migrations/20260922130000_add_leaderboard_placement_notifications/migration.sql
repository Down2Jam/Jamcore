ALTER TYPE "NotificationType" ADD VALUE 'LEADERBOARD_TOP_SPOT_LOST';
ALTER TYPE "NotificationType" ADD VALUE 'LEADERBOARD_TOP_THREE_LOST';
ALTER TYPE "NotificationType" ADD VALUE 'LEADERBOARD_TOP_FIVE_LOST';

ALTER TABLE "Score"
ADD COLUMN "placementAlertThreshold" INTEGER,
ADD COLUMN "placementAlertSentAt" TIMESTAMP(3);

CREATE INDEX "Score_leaderboardId_placementAlertSentAt_idx"
ON "Score"("leaderboardId", "placementAlertSentAt");

WITH per_user_scores AS (
  SELECT
    score.id,
    score."userId",
    score."leaderboardId",
    score.data,
    score."createdAt",
    leaderboard.type,
    leaderboard."onlyBest",
    page."gameId",
    ROW_NUMBER() OVER (
      PARTITION BY score."leaderboardId", score."userId"
      ORDER BY
        CASE WHEN leaderboard.type IN ('GOLF', 'SPEEDRUN') THEN score.data END ASC NULLS LAST,
        CASE WHEN leaderboard.type NOT IN ('GOLF', 'SPEEDRUN') THEN score.data END DESC NULLS LAST,
        score.id ASC
    ) AS user_position
  FROM "Score" AS score
  JOIN "GamePageLeaderboard" AS leaderboard
    ON leaderboard.id = score."leaderboardId"
  JOIN "GamePage" AS page
    ON page.id = leaderboard."gamePageId"
), ranked_scores AS (
  SELECT
    id,
    "userId",
    "leaderboardId",
    "gameId",
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "leaderboardId"
      ORDER BY
        CASE WHEN type IN ('GOLF', 'SPEEDRUN') THEN data END ASC NULLS LAST,
        CASE WHEN type NOT IN ('GOLF', 'SPEEDRUN') THEN data END DESC NULLS LAST,
        id ASC
    ) AS placement
  FROM per_user_scores
  WHERE NOT "onlyBest" OR user_position = 1
), current_qualifying_scores AS (
  SELECT
    id,
    placement,
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "gameId"
      ORDER BY "createdAt" DESC, id DESC
    ) AS watch_order
  FROM ranked_scores
  WHERE placement <= 5
)
UPDATE "Score" AS score
SET "placementAlertThreshold" = CASE
  WHEN qualifying.placement = 1 THEN 1
  WHEN qualifying.placement <= 3 THEN 3
  ELSE 5
END
FROM current_qualifying_scores AS qualifying
WHERE score.id = qualifying.id
  AND qualifying.watch_order = 1;
