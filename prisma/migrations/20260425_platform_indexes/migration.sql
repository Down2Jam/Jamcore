CREATE INDEX IF NOT EXISTS "Game_published_jamId_id_idx"
ON "Game" ("published", "jamId", "id");

CREATE INDEX IF NOT EXISTS "Post_deletedAt_removedAt_createdAt_idx"
ON "Post" ("deletedAt", "removedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Post_sticky_createdAt_idx"
ON "Post" ("sticky", "createdAt");

CREATE INDEX IF NOT EXISTS "User_name_idx"
ON "User" ("name");

CREATE INDEX IF NOT EXISTS "GamePageTrack_updatedAt_idx"
ON "GamePageTrack" ("updatedAt");
