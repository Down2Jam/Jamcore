-- Preserve notification types already present in existing databases.
-- IF NOT EXISTS also permits deploying this migration to those databases.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEADERBOARD_TOP_SPOT_LOST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEADERBOARD_TOP_THREE_LOST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEADERBOARD_TOP_FIVE_LOST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STREAM_LIVE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RATING_REMINDER';
