ALTER TYPE "NotificationType" ADD VALUE 'STREAM_LIVE';

ALTER TABLE "NotificationPreference"
ADD COLUMN "enabled_types" JSONB NOT NULL DEFAULT '[]';
