CREATE TABLE "TrackAudioAnalysis" (
  "sourceKey" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "duration" DOUBLE PRECISION,
  "waveform" JSONB,
  "rhythm" JSONB,
  "integratedLufs" DOUBLE PRECISION,
  "truePeakDb" DOUBLE PRECISION,
  "loudnessGainDb" DOUBLE PRECISION,
  "error" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TrackAudioAnalysis_status_retryAt_idx" ON "TrackAudioAnalysis"("status", "retryAt");

-- Seed durable jobs without decoding audio inside a database migration.
INSERT INTO "TrackAudioAnalysis" ("sourceKey")
SELECT DISTINCT regexp_replace(split_part(split_part("url", '?', 1), '#', 1), '^.*/', '')
FROM "GamePageTrack"
WHERE regexp_replace(split_part(split_part("url", '?', 1), '#', 1), '^.*/', '') ~* '^[A-Za-z0-9._-]+\.(mp3|ogg|wav)$'
ON CONFLICT DO NOTHING;
