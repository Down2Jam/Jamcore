ALTER TYPE "NotificationType" ADD VALUE 'RATING_REMINDER';

ALTER TABLE "Jam"
  ADD COLUMN music_ranking_rule_version INTEGER NOT NULL DEFAULT 2;

-- Preserve music results for jams whose main rating period already ended.
UPDATE "Jam"
SET music_ranking_rule_version = 1
WHERE "startTime" + ("jammingHours" + "submissionHours" + "ratingHours") * INTERVAL '1 hour' <= NOW();

ALTER TABLE "Notification" ADD COLUMN dedupe_key TEXT;
CREATE UNIQUE INDEX "Notification_dedupe_key_key" ON "Notification"(dedupe_key);

CREATE TABLE "JamRatingReminderDispatch" (
  jam_id INTEGER PRIMARY KEY REFERENCES "Jam"(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP(3)
);

-- Existing missed midpoints are excluded from automatic delivery. The one
-- currently active native jam can be handled by the explicit catch-up command.
INSERT INTO "JamRatingReminderDispatch" (jam_id, status)
SELECT jam.id,
  CASE WHEN jam.id = (
    SELECT current_jam.id
    FROM "Jam" current_jam
    WHERE current_jam."isActive" = TRUE
      AND current_jam.source_platform IS NULL
      AND NOW() >= current_jam."startTime" +
        (current_jam."jammingHours" + current_jam."submissionHours" + current_jam."ratingHours" / 2.0) * INTERVAL '1 hour'
      AND NOW() < current_jam."startTime" +
        (current_jam."jammingHours" + current_jam."submissionHours" + current_jam."ratingHours") * INTERVAL '1 hour'
    ORDER BY current_jam."startTime" DESC
    LIMIT 1
  ) THEN 'MANUAL_ELIGIBLE' ELSE 'SKIPPED' END
FROM "Jam" jam
WHERE NOW() >= jam."startTime" +
  (jam."jammingHours" + jam."submissionHours" + jam."ratingHours" / 2.0) * INTERVAL '1 hour';
