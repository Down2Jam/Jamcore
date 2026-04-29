ALTER TABLE "Report"
  ADD COLUMN IF NOT EXISTS collection_comment_id TEXT NULL REFERENCES jamcore_collection_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS Report_collection_comment_idx
  ON "Report" (collection_comment_id);

CREATE TABLE IF NOT EXISTS jamcore_user_follows (
  follower_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  tenant_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS jamcore_user_follows_following_idx
  ON jamcore_user_follows (tenant_id, following_id, created_at DESC);

CREATE INDEX IF NOT EXISTS jamcore_user_follows_follower_idx
  ON jamcore_user_follows (tenant_id, follower_id, created_at DESC);
