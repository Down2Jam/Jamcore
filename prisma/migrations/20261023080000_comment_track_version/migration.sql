ALTER TABLE "Comment" ADD COLUMN "trackPageVersion" "PageVersion";

UPDATE "Comment" AS c
SET "trackPageVersion" = p."version"
FROM "GamePageTrack" AS t
JOIN "GamePage" AS p ON p.id = t."gamePageId"
WHERE c."trackId" = t.id;
