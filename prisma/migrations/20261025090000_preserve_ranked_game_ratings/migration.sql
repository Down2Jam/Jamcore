ALTER TABLE "Rating" ADD COLUMN "rankedValue" INTEGER;
ALTER TABLE "Rating" ADD COLUMN "rankedUpdatedAt" TIMESTAMP(3);

-- Only snapshot values known to have been saved inside their version's rating window.
UPDATE "Rating" r
SET "rankedValue" = r.value, "rankedUpdatedAt" = r."updatedAt"
FROM "GamePage" p
JOIN "Game" g ON g.id = p."gameId"
JOIN "Jam" j ON j.id = g."jamId"
WHERE r."gamePageId" = p.id AND (
  (p.version = 'JAM'
   AND r."updatedAt" >= j."startTime" + j."jammingHours" * INTERVAL '1 hour'
   AND r."updatedAt" < j."startTime" + (j."jammingHours" + j."submissionHours" + j."ratingHours") * INTERVAL '1 hour')
  OR
  (p.version = 'POST_JAM'
   AND r."updatedAt" >= j."startTime" + (j."jammingHours" + j."submissionHours" + j."ratingHours" + j."postJamRefinementHours") * INTERVAL '1 hour'
   AND r."updatedAt" < j."startTime" + (j."jammingHours" + j."submissionHours" + j."ratingHours" + j."postJamRefinementHours" + j."postJamRatingHours") * INTERVAL '1 hour')
);
