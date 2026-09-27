CREATE TYPE "ReactionKind" AS ENUM ('EMOTE', 'STICKER');

ALTER TABLE "Reaction"
ADD COLUMN "kind" "ReactionKind" NOT NULL DEFAULT 'EMOTE';

CREATE INDEX "Reaction_kind_slug_idx" ON "Reaction"("kind", "slug");
