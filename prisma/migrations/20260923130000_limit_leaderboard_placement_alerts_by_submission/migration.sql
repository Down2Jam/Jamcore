WITH submissions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "leaderboardId"
      ORDER BY id
    ) AS submission_number
  FROM "Score"
)
UPDATE "Score" AS score
SET "placementAlertThreshold" = NULL,
    "placementAlertSentAt" = NULL
FROM submissions
WHERE score.id = submissions.id
  AND (
    (score."placementAlertThreshold" = 1 AND submissions.submission_number < 5)
    OR (score."placementAlertThreshold" = 3 AND submissions.submission_number < 10)
    OR (score."placementAlertThreshold" = 5 AND submissions.submission_number < 15)
  );
