CREATE TYPE "PageVersion" AS ENUM ('JAM', 'POST_JAM');

CREATE TABLE "GamePage" (
  "id" SERIAL NOT NULL,
  "version" "PageVersion" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "short" TEXT,
  "thumbnail" TEXT,
  "banner" TEXT,
  "screenshots" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "trailerUrl" TEXT,
  "itchEmbedUrl" TEXT,
  "itchEmbedAspectRatio" TEXT,
  "inputMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "estOneRun" TEXT,
  "estAnyPercent" TEXT,
  "estHundredPercent" TEXT,
  "category" "GameCategory" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "themeJustification" TEXT,
  "emotePrefix" TEXT,
  "gameId" INTEGER NOT NULL,
  CONSTRAINT "GamePage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePageDownloadLink" (
  "id" SERIAL NOT NULL,
  "url" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "gamePageId" INTEGER NOT NULL,
  CONSTRAINT "GamePageDownloadLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePageTrack" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "license" TEXT,
  "allowDownload" BOOLEAN NOT NULL DEFAULT false,
  "allowBackgroundUse" BOOLEAN NOT NULL DEFAULT false,
  "allowBackgroundUseAttribution" BOOLEAN NOT NULL DEFAULT false,
  "bpm" INTEGER,
  "musicalKey" TEXT,
  "softwareUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "commentary" TEXT,
  "composerId" INTEGER NOT NULL,
  "gamePageId" INTEGER NOT NULL,
  CONSTRAINT "GamePageTrack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePageTrackLink" (
  "id" SERIAL NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "trackId" INTEGER NOT NULL,
  CONSTRAINT "GamePageTrackLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePageTrackCredit" (
  "id" SERIAL NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "trackId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  CONSTRAINT "GamePageTrackCredit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePageLeaderboard" (
  "id" SERIAL NOT NULL,
  "type" "LeaderboardType" NOT NULL,
  "name" TEXT NOT NULL,
  "decimalPlaces" INTEGER NOT NULL DEFAULT 0,
  "maxUsersShown" INTEGER NOT NULL DEFAULT 10,
  "onlyBest" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "gamePageId" INTEGER NOT NULL,
  CONSTRAINT "GamePageLeaderboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePageAchievement" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "image" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "gamePageId" INTEGER NOT NULL,
  CONSTRAINT "GamePageAchievement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Comment"
ADD COLUMN "gamePageId" INTEGER;

ALTER TABLE "Rating"
ADD COLUMN "gamePageId" INTEGER;

ALTER TABLE "Ghost"
ADD COLUMN "gamePageId" INTEGER;

ALTER TABLE "Data"
ADD COLUMN "gamePageId" INTEGER;

CREATE UNIQUE INDEX "GamePage_gameId_version_key"
ON "GamePage"("gameId", "version");

CREATE UNIQUE INDEX "GamePageTrack_gamePageId_slug_key"
ON "GamePageTrack"("gamePageId", "slug");

CREATE TABLE "_GamePageToRatingCategory" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL
);

CREATE TABLE "_GamePageToMajorityContentRating" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL
);

CREATE TABLE "_GamePagesToFlags" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL
);

CREATE TABLE "_GamePagesToTags" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL
);

CREATE TABLE "_GamePageTrackToTrackTag" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL
);

CREATE TABLE "_GamePageTrackToTrackFlag" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL
);

CREATE UNIQUE INDEX "_GamePageToRatingCategory_AB_unique" ON "_GamePageToRatingCategory"("A", "B");
CREATE INDEX "_GamePageToRatingCategory_B_index" ON "_GamePageToRatingCategory"("B");
CREATE UNIQUE INDEX "_GamePageToMajorityContentRating_AB_unique" ON "_GamePageToMajorityContentRating"("A", "B");
CREATE INDEX "_GamePageToMajorityContentRating_B_index" ON "_GamePageToMajorityContentRating"("B");
CREATE UNIQUE INDEX "_GamePagesToFlags_AB_unique" ON "_GamePagesToFlags"("A", "B");
CREATE INDEX "_GamePagesToFlags_B_index" ON "_GamePagesToFlags"("B");
CREATE UNIQUE INDEX "_GamePagesToTags_AB_unique" ON "_GamePagesToTags"("A", "B");
CREATE INDEX "_GamePagesToTags_B_index" ON "_GamePagesToTags"("B");
CREATE UNIQUE INDEX "_GamePageTrackToTrackTag_AB_unique" ON "_GamePageTrackToTrackTag"("A", "B");
CREATE INDEX "_GamePageTrackToTrackTag_B_index" ON "_GamePageTrackToTrackTag"("B");
CREATE UNIQUE INDEX "_GamePageTrackToTrackFlag_AB_unique" ON "_GamePageTrackToTrackFlag"("A", "B");
CREATE INDEX "_GamePageTrackToTrackFlag_B_index" ON "_GamePageTrackToTrackFlag"("B");

ALTER TABLE "GamePage"
ADD CONSTRAINT "GamePage_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePageDownloadLink"
ADD CONSTRAINT "GamePageDownloadLink_gamePageId_fkey"
FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePageTrack"
ADD CONSTRAINT "GamePageTrack_composerId_fkey"
FOREIGN KEY ("composerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GamePageTrack"
ADD CONSTRAINT "GamePageTrack_gamePageId_fkey"
FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePageTrackLink"
ADD CONSTRAINT "GamePageTrackLink_trackId_fkey"
FOREIGN KEY ("trackId") REFERENCES "GamePageTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePageTrackCredit"
ADD CONSTRAINT "GamePageTrackCredit_trackId_fkey"
FOREIGN KEY ("trackId") REFERENCES "GamePageTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePageTrackCredit"
ADD CONSTRAINT "GamePageTrackCredit_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GamePageLeaderboard"
ADD CONSTRAINT "GamePageLeaderboard_gamePageId_fkey"
FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePageAchievement"
ADD CONSTRAINT "GamePageAchievement_gamePageId_fkey"
FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment"
ADD CONSTRAINT "Comment_gamePageId_fkey"
FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Rating"
ADD CONSTRAINT "Rating_gamePageId_fkey"
FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Ghost"
ADD CONSTRAINT "Ghost_gamePageId_fkey"
FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Data"
ADD CONSTRAINT "Data_gamePageId_fkey"
FOREIGN KEY ("gamePageId") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GamePageToRatingCategory"
ADD CONSTRAINT "_GamePageToRatingCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_GamePageToRatingCategory"
ADD CONSTRAINT "_GamePageToRatingCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "RatingCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GamePageToMajorityContentRating"
ADD CONSTRAINT "_GamePageToMajorityContentRating_A_fkey" FOREIGN KEY ("A") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_GamePageToMajorityContentRating"
ADD CONSTRAINT "_GamePageToMajorityContentRating_B_fkey" FOREIGN KEY ("B") REFERENCES "RatingCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GamePagesToFlags"
ADD CONSTRAINT "_GamePagesToFlags_A_fkey" FOREIGN KEY ("A") REFERENCES "Flag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_GamePagesToFlags"
ADD CONSTRAINT "_GamePagesToFlags_B_fkey" FOREIGN KEY ("B") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GamePagesToTags"
ADD CONSTRAINT "_GamePagesToTags_A_fkey" FOREIGN KEY ("A") REFERENCES "GamePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_GamePagesToTags"
ADD CONSTRAINT "_GamePagesToTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GamePageTrackToTrackTag"
ADD CONSTRAINT "_GamePageTrackToTrackTag_A_fkey" FOREIGN KEY ("A") REFERENCES "GamePageTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_GamePageTrackToTrackTag"
ADD CONSTRAINT "_GamePageTrackToTrackTag_B_fkey" FOREIGN KEY ("B") REFERENCES "TrackTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GamePageTrackToTrackFlag"
ADD CONSTRAINT "_GamePageTrackToTrackFlag_A_fkey" FOREIGN KEY ("A") REFERENCES "GamePageTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_GamePageTrackToTrackFlag"
ADD CONSTRAINT "_GamePageTrackToTrackFlag_B_fkey" FOREIGN KEY ("B") REFERENCES "TrackFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "GamePage" (
  "version",
  "name",
  "description",
  "short",
  "thumbnail",
  "banner",
  "screenshots",
  "trailerUrl",
  "itchEmbedUrl",
  "itchEmbedAspectRatio",
  "inputMethods",
  "estOneRun",
  "estAnyPercent",
  "estHundredPercent",
  "category",
  "createdAt",
  "updatedAt",
  "themeJustification",
  "emotePrefix",
  "gameId"
)
SELECT
  'JAM'::"PageVersion",
  g."name",
  g."description",
  g."short",
  g."thumbnail",
  g."banner",
  g."screenshots",
  g."trailerUrl",
  g."itchEmbedUrl",
  g."itchEmbedAspectRatio",
  g."inputMethods",
  g."estOneRun",
  g."estAnyPercent",
  g."estHundredPercent",
  g."category",
  g."createdAt",
  g."updatedAt",
  g."themeJustification",
  g."emotePrefix",
  g."id"
FROM "Game" g;

INSERT INTO "_GamePageToRatingCategory" ("A", "B")
SELECT gp."id", x."B"
FROM "GamePage" gp
JOIN "_GameToRatingCategory" x ON x."A" = gp."gameId"
WHERE gp."version" = 'JAM';

INSERT INTO "_GamePageToMajorityContentRating" ("A", "B")
SELECT gp."id", x."B"
FROM "GamePage" gp
JOIN "_GameToMajorityContentRating" x ON x."A" = gp."gameId"
WHERE gp."version" = 'JAM';

INSERT INTO "_GamePagesToFlags" ("A", "B")
SELECT x."A", gp."id"
FROM "GamePage" gp
JOIN "_GamesToFlags" x ON x."B" = gp."gameId"
WHERE gp."version" = 'JAM';

INSERT INTO "_GamePagesToTags" ("A", "B")
SELECT gp."id", x."B"
FROM "GamePage" gp
JOIN "_GamesToTags" x ON x."A" = gp."gameId"
WHERE gp."version" = 'JAM';

INSERT INTO "GamePageDownloadLink" ("url", "platform", "gamePageId")
SELECT dl."url", dl."platform", gp."id"
FROM "GameDownloadLink" dl
JOIN "GamePage" gp ON gp."gameId" = dl."gameId" AND gp."version" = 'JAM';

INSERT INTO "GamePageLeaderboard" (
  "type",
  "name",
  "decimalPlaces",
  "maxUsersShown",
  "onlyBest",
  "createdAt",
  "updatedAt",
  "gamePageId"
)
SELECT lb."type", lb."name", lb."decimalPlaces", lb."maxUsersShown", lb."onlyBest", lb."createdAt", lb."updatedAt", gp."id"
FROM "Leaderboard" lb
JOIN "GamePage" gp ON gp."gameId" = lb."gameId" AND gp."version" = 'JAM';

INSERT INTO "GamePageAchievement" (
  "name",
  "description",
  "image",
  "createdAt",
  "updatedAt",
  "gamePageId"
)
SELECT a."name", a."description", a."image", a."createdAt", a."updatedAt", gp."id"
FROM "Achievement" a
JOIN "GamePage" gp ON gp."gameId" = a."gameId" AND gp."version" = 'JAM';

INSERT INTO "GamePageTrack" (
  "slug",
  "url",
  "name",
  "license",
  "allowDownload",
  "allowBackgroundUse",
  "allowBackgroundUseAttribution",
  "bpm",
  "musicalKey",
  "softwareUsed",
  "createdAt",
  "updatedAt",
  "commentary",
  "composerId",
  "gamePageId"
)
SELECT
  t."slug",
  t."url",
  t."name",
  t."license",
  t."allowDownload",
  t."allowBackgroundUse",
  t."allowBackgroundUseAttribution",
  t."bpm",
  t."musicalKey",
  t."softwareUsed",
  t."createdAt",
  t."updatedAt",
  t."commentary",
  t."composerId",
  gp."id"
FROM "Track" t
JOIN "GamePage" gp ON gp."gameId" = t."gameId" AND gp."version" = 'JAM';

INSERT INTO "GamePageTrackLink" ("label", "url", "createdAt", "updatedAt", "trackId")
SELECT l."label", l."url", l."createdAt", l."updatedAt", gpt."id"
FROM "TrackLink" l
JOIN "Track" t ON t."id" = l."trackId"
JOIN "GamePage" gp ON gp."gameId" = t."gameId" AND gp."version" = 'JAM'
JOIN "GamePageTrack" gpt ON gpt."gamePageId" = gp."id" AND gpt."slug" = t."slug";

INSERT INTO "GamePageTrackCredit" ("role", "createdAt", "updatedAt", "trackId", "userId")
SELECT c."role", c."createdAt", c."updatedAt", gpt."id", c."userId"
FROM "TrackCredit" c
JOIN "Track" t ON t."id" = c."trackId"
JOIN "GamePage" gp ON gp."gameId" = t."gameId" AND gp."version" = 'JAM'
JOIN "GamePageTrack" gpt ON gpt."gamePageId" = gp."id" AND gpt."slug" = t."slug";

INSERT INTO "_GamePageTrackToTrackTag" ("A", "B")
SELECT gpt."id", x."B"
FROM "_TrackToTrackTag" x
JOIN "Track" t ON t."id" = x."A"
JOIN "GamePage" gp ON gp."gameId" = t."gameId" AND gp."version" = 'JAM'
JOIN "GamePageTrack" gpt ON gpt."gamePageId" = gp."id" AND gpt."slug" = t."slug";

INSERT INTO "_GamePageTrackToTrackFlag" ("A", "B")
SELECT gpt."id", x."B"
FROM "_TrackToTrackFlag" x
JOIN "Track" t ON t."id" = x."A"
JOIN "GamePage" gp ON gp."gameId" = t."gameId" AND gp."version" = 'JAM'
JOIN "GamePageTrack" gpt ON gpt."gamePageId" = gp."id" AND gpt."slug" = t."slug";

UPDATE "Comment" c
SET "gamePageId" = gp."id"
FROM "GamePage" gp
WHERE gp."gameId" = c."gameId"
  AND gp."version" = 'JAM'
  AND c."gameId" IS NOT NULL;

UPDATE "Rating" r
SET "gamePageId" = gp."id"
FROM "GamePage" gp
WHERE gp."gameId" = r."gameId"
  AND gp."version" = 'JAM';

-- Delete duplicate ratings, keeping only the most recent one for each unique (gamePageId, categoryId, userId) combination
DELETE FROM "Rating" r1
WHERE r1."id" NOT IN (
  SELECT DISTINCT ON (r2."gamePageId", r2."categoryId", r2."userId") r2."id"
  FROM "Rating" r2
  WHERE r2."gamePageId" IS NOT NULL
  ORDER BY r2."gamePageId", r2."categoryId", r2."userId", r2."updatedAt" DESC
);

-- Now create the unique index after duplicates are removed
CREATE UNIQUE INDEX "Rating_gamePageId_categoryId_userId_key"
ON "Rating"("gamePageId", "categoryId", "userId");

UPDATE "Ghost" g
SET "gamePageId" = gp."id"
FROM "GamePage" gp
WHERE gp."gameId" = g."gameId"
  AND gp."version" = 'JAM';

UPDATE "Data" d
SET "gamePageId" = gp."id"
FROM "GamePage" gp
WHERE gp."gameId" = d."gameId"
  AND gp."version" = 'JAM';

ALTER TABLE "Ghost"
ALTER COLUMN "gamePageId" SET NOT NULL;

ALTER TABLE "Data"
ALTER COLUMN "gamePageId" SET NOT NULL;

ALTER TABLE "Ghost"
DROP CONSTRAINT "Ghost_gameId_fkey";

ALTER TABLE "Data"
DROP CONSTRAINT "Data_gameId_fkey";

ALTER TABLE "Ghost"
DROP COLUMN "gameId";

ALTER TABLE "Data"
DROP COLUMN "gameId";

ALTER TABLE "Rating"
ALTER COLUMN "gamePageId" SET NOT NULL;
