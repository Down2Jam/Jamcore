CREATE TABLE "_UserRecommendedGames" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

CREATE TABLE "_UserRecommendedPosts" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

CREATE TABLE "_UserRecommendedTracks" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

CREATE UNIQUE INDEX "_UserRecommendedGames_AB_unique" ON "_UserRecommendedGames"("A", "B");
CREATE INDEX "_UserRecommendedGames_B_index" ON "_UserRecommendedGames"("B");

CREATE UNIQUE INDEX "_UserRecommendedPosts_AB_unique" ON "_UserRecommendedPosts"("A", "B");
CREATE INDEX "_UserRecommendedPosts_B_index" ON "_UserRecommendedPosts"("B");

CREATE UNIQUE INDEX "_UserRecommendedTracks_AB_unique" ON "_UserRecommendedTracks"("A", "B");
CREATE INDEX "_UserRecommendedTracks_B_index" ON "_UserRecommendedTracks"("B");

ALTER TABLE "_UserRecommendedGames"
ADD CONSTRAINT "_UserRecommendedGames_A_fkey"
FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_UserRecommendedGames"
ADD CONSTRAINT "_UserRecommendedGames_B_fkey"
FOREIGN KEY ("B") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_UserRecommendedPosts"
ADD CONSTRAINT "_UserRecommendedPosts_A_fkey"
FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_UserRecommendedPosts"
ADD CONSTRAINT "_UserRecommendedPosts_B_fkey"
FOREIGN KEY ("B") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_UserRecommendedTracks"
ADD CONSTRAINT "_UserRecommendedTracks_A_fkey"
FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_UserRecommendedTracks"
ADD CONSTRAINT "_UserRecommendedTracks_B_fkey"
FOREIGN KEY ("B") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
