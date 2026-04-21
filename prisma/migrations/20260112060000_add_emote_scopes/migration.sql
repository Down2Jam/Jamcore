-- Add emote prefixes and scope metadata
ALTER TABLE "User" ADD COLUMN "emotePrefix" TEXT;
ALTER TABLE "Game" ADD COLUMN "emotePrefix" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReactionScope') THEN
    CREATE TYPE "ReactionScope" AS ENUM ('GLOBAL', 'USER', 'GAME');
  END IF;
END$$;

ALTER TABLE "Reaction" ADD COLUMN "scopeType" "ReactionScope" NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "Reaction" ADD COLUMN "scopeUserId" INTEGER;
ALTER TABLE "Reaction" ADD COLUMN "scopeGameId" INTEGER;

ALTER TABLE "Reaction"
ADD CONSTRAINT "Reaction_scopeUserId_fkey"
FOREIGN KEY ("scopeUserId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Reaction"
ADD CONSTRAINT "Reaction_scopeGameId_fkey"
FOREIGN KEY ("scopeGameId") REFERENCES "Game"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
