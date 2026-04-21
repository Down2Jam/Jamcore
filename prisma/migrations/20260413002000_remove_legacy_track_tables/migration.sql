-- Move legacy Track-owned interaction data onto JAM GamePageTrack rows before
-- removing the old Track tables.

ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_trackId_fkey";
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_trackId_fkey";
ALTER TABLE "TrackRating" DROP CONSTRAINT IF EXISTS "TrackRating_trackId_fkey";
ALTER TABLE "TrackTimestampComment" DROP CONSTRAINT IF EXISTS "TrackTimestampComment_trackId_fkey";
ALTER TABLE "TrackLink" DROP CONSTRAINT IF EXISTS "TrackLink_trackId_fkey";
ALTER TABLE "TrackCredit" DROP CONSTRAINT IF EXISTS "TrackCredit_trackId_fkey";
ALTER TABLE "_UserRecommendedTracks" DROP CONSTRAINT IF EXISTS "_UserRecommendedTracks_A_fkey";

WITH track_map AS (
  SELECT
    t."id" AS legacy_track_id,
    gpt."id" AS game_page_track_id
  FROM "Track" t
  JOIN "GamePage" gp
    ON gp."gameId" = t."gameId"
   AND gp."version" = 'JAM'
  JOIN "GamePageTrack" gpt
    ON gpt."gamePageId" = gp."id"
   AND gpt."slug" = t."slug"
)
UPDATE "Comment" c
SET "trackId" = track_map."game_page_track_id"
FROM track_map
WHERE c."trackId" = track_map."legacy_track_id";

WITH track_map AS (
  SELECT
    t."id" AS legacy_track_id,
    gpt."id" AS game_page_track_id
  FROM "Track" t
  JOIN "GamePage" gp
    ON gp."gameId" = t."gameId"
   AND gp."version" = 'JAM'
  JOIN "GamePageTrack" gpt
    ON gpt."gamePageId" = gp."id"
   AND gpt."slug" = t."slug"
)
UPDATE "Notification" n
SET "trackId" = track_map."game_page_track_id"
FROM track_map
WHERE n."trackId" = track_map."legacy_track_id";

WITH track_map AS (
  SELECT
    t."id" AS legacy_track_id,
    gpt."id" AS game_page_track_id
  FROM "Track" t
  JOIN "GamePage" gp
    ON gp."gameId" = t."gameId"
   AND gp."version" = 'JAM'
  JOIN "GamePageTrack" gpt
    ON gpt."gamePageId" = gp."id"
   AND gpt."slug" = t."slug"
)
DELETE FROM "TrackRating" legacy
USING track_map, "TrackRating" existing
WHERE legacy."trackId" = track_map."legacy_track_id"
  AND existing."trackId" = track_map."game_page_track_id"
  AND existing."categoryId" = legacy."categoryId"
  AND existing."userId" = legacy."userId";

WITH track_map AS (
  SELECT
    t."id" AS legacy_track_id,
    gpt."id" AS game_page_track_id
  FROM "Track" t
  JOIN "GamePage" gp
    ON gp."gameId" = t."gameId"
   AND gp."version" = 'JAM'
  JOIN "GamePageTrack" gpt
    ON gpt."gamePageId" = gp."id"
   AND gpt."slug" = t."slug"
)
UPDATE "TrackRating" r
SET "trackId" = track_map."game_page_track_id"
FROM track_map
WHERE r."trackId" = track_map."legacy_track_id";

WITH track_map AS (
  SELECT
    t."id" AS legacy_track_id,
    gpt."id" AS game_page_track_id
  FROM "Track" t
  JOIN "GamePage" gp
    ON gp."gameId" = t."gameId"
   AND gp."version" = 'JAM'
  JOIN "GamePageTrack" gpt
    ON gpt."gamePageId" = gp."id"
   AND gpt."slug" = t."slug"
)
UPDATE "TrackTimestampComment" tc
SET "trackId" = track_map."game_page_track_id"
FROM track_map
WHERE tc."trackId" = track_map."legacy_track_id";

WITH track_map AS (
  SELECT
    t."id" AS legacy_track_id,
    gpt."id" AS game_page_track_id
  FROM "Track" t
  JOIN "GamePage" gp
    ON gp."gameId" = t."gameId"
   AND gp."version" = 'JAM'
  JOIN "GamePageTrack" gpt
    ON gpt."gamePageId" = gp."id"
   AND gpt."slug" = t."slug"
)
DELETE FROM "_UserRecommendedTracks" legacy
USING track_map, "_UserRecommendedTracks" existing
WHERE legacy."A" = track_map."legacy_track_id"
  AND existing."A" = track_map."game_page_track_id"
  AND existing."B" = legacy."B";

WITH track_map AS (
  SELECT
    t."id" AS legacy_track_id,
    gpt."id" AS game_page_track_id
  FROM "Track" t
  JOIN "GamePage" gp
    ON gp."gameId" = t."gameId"
   AND gp."version" = 'JAM'
  JOIN "GamePageTrack" gpt
    ON gpt."gamePageId" = gp."id"
   AND gpt."slug" = t."slug"
)
UPDATE "_UserRecommendedTracks" urt
SET "A" = track_map."game_page_track_id"
FROM track_map
WHERE urt."A" = track_map."legacy_track_id";

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "GamePageTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "GamePageTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrackRating"
  ADD CONSTRAINT "TrackRating_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "GamePageTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrackTimestampComment"
  ADD CONSTRAINT "TrackTimestampComment_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "GamePageTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "_UserRecommendedTracks"
  ADD CONSTRAINT "_UserRecommendedTracks_A_fkey"
  FOREIGN KEY ("A") REFERENCES "GamePageTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "TrackCredit";
DROP TABLE "TrackLink";
DROP TABLE IF EXISTS "_TrackToTrackTag";
DROP TABLE IF EXISTS "_TrackToTrackFlag";
DROP TABLE "Track";
