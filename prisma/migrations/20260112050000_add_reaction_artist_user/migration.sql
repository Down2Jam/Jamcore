-- Add optional artist user reference for emoji credits
ALTER TABLE "Reaction" ADD COLUMN "artistId" INTEGER;

ALTER TABLE "Reaction"
ADD CONSTRAINT "Reaction_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
