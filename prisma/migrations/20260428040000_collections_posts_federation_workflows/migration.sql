ALTER TABLE jamcore_collections
  ADD COLUMN IF NOT EXISTS forked_from_id TEXT NULL REFERENCES jamcore_collections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS playback_mode TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jamcore_collections_playback_mode_check'
  ) THEN
    ALTER TABLE jamcore_collections
      ADD CONSTRAINT jamcore_collections_playback_mode_check
      CHECK (playback_mode IN ('manual', 'shuffle', 'repeat'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS jamcore_collections_discovery_idx
  ON jamcore_collections (tenant_id, visibility, updated_at DESC);

CREATE INDEX IF NOT EXISTS jamcore_collection_items_discovery_idx
  ON jamcore_collection_items (item_type, item_id);

ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_draft_status_check";

ALTER TABLE "Post"
  ADD CONSTRAINT "Post_draft_status_check"
  CHECK (draft_status IN ('draft', 'scheduled', 'published', 'pending_review'));

CREATE TABLE IF NOT EXISTS jamcore_post_games (
  post_id INTEGER NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES "Game"(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'devlog',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, game_id),
  CONSTRAINT jamcore_post_games_relation_type_check
    CHECK (relation_type IN ('devlog', 'release', 'postmortem', 'announcement', 'other'))
);

CREATE INDEX IF NOT EXISTS jamcore_post_games_game_idx
  ON jamcore_post_games (game_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_post_collaborators (
  post_id INTEGER NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'coauthor',
  status TEXT NOT NULL DEFAULT 'accepted',
  invited_by INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT jamcore_post_collaborators_role_check
    CHECK (role IN ('coauthor', 'editor')),
  CONSTRAINT jamcore_post_collaborators_status_check
    CHECK (status IN ('pending', 'accepted', 'declined'))
);

CREATE TABLE IF NOT EXISTS jamcore_content_review_settings (
  tenant_id TEXT PRIMARY KEY,
  require_post_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_first_posts_only BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jamcore_federation_reputation (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL,
  host TEXT NOT NULL,
  trust_level TEXT NOT NULL DEFAULT 'unknown',
  deliveries_failed INTEGER NOT NULL DEFAULT 0,
  deliveries_succeeded INTEGER NOT NULL DEFAULT 0,
  rejected_activities INTEGER NOT NULL DEFAULT 0,
  accepted_activities INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT NULL,
  updated_by INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_federation_reputation_trust_check
    CHECK (trust_level IN ('trusted', 'unknown', 'limited', 'blocked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_federation_reputation_host_key
  ON jamcore_federation_reputation (tenant_id, host);

CREATE TABLE IF NOT EXISTS jamcore_federation_preview_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL,
  actor_id TEXT NOT NULL,
  activity_id TEXT NULL,
  activity_type TEXT NULL,
  object_type TEXT NULL,
  summary TEXT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_federation_preview_queue_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS jamcore_federation_preview_queue_idx
  ON jamcore_federation_preview_queue (tenant_id, status, created_at DESC);
