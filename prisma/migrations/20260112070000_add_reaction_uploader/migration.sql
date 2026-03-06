-- Track who uploaded or last edited an emoji
ALTER TABLE "Reaction" ADD COLUMN "uploaderId" INTEGER;

ALTER TABLE "Reaction"
ADD CONSTRAINT "Reaction_uploaderId_fkey"
FOREIGN KEY ("uploaderId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
