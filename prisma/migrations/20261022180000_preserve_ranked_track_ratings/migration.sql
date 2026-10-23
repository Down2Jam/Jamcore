ALTER TABLE "TrackRating" ADD COLUMN "rankedValue" INTEGER;
ALTER TABLE "TrackRating" ADD COLUMN "rankedUpdatedAt" TIMESTAMP(3);

-- Only snapshot values known to have been saved inside their version's rating window.
UPDATE "TrackRating" r
SET "rankedValue" = r.value, "rankedUpdatedAt" = r."updatedAt"
FROM "GamePageTrack" t
JOIN "GamePage" p ON p.id = t."gamePageId"
JOIN "Game" g ON g.id = p."gameId"
JOIN "Jam" j ON j.id = g."jamId"
WHERE r."trackId" = t.id AND (
  (p.version = 'JAM'
   AND r."updatedAt" >= j."startTime" + j."jammingHours" * INTERVAL '1 hour'
   AND r."updatedAt" < j."startTime" + (j."jammingHours" + j."submissionHours" + j."ratingHours") * INTERVAL '1 hour')
  OR
  (p.version = 'POST_JAM'
   AND r."updatedAt" >= j."startTime" + (j."jammingHours" + j."submissionHours" + j."ratingHours" + j."postJamRefinementHours") * INTERVAL '1 hour'
   AND r."updatedAt" < j."startTime" + (j."jammingHours" + j."submissionHours" + j."ratingHours" + j."postJamRefinementHours" + j."postJamRatingHours") * INTERVAL '1 hour')
);
