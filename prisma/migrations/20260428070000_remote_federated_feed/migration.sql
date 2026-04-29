CREATE TABLE IF NOT EXISTS jamcore_remote_feed_posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL,
  activity_id TEXT NULL,
  object_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NULL,
  actor_url TEXT NULL,
  source_host TEXT NULL,
  title TEXT NULL,
  content TEXT NOT NULL,
  url TEXT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_type TEXT NOT NULL DEFAULT 'activitypub',
  status TEXT NOT NULL DEFAULT 'published',
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_remote_feed_posts_tenant_object_idx
  ON jamcore_remote_feed_posts (tenant_id, object_id);

CREATE INDEX IF NOT EXISTS jamcore_remote_feed_posts_tenant_time_idx
  ON jamcore_remote_feed_posts (tenant_id, status, COALESCE(published_at, created_at) DESC);

CREATE INDEX IF NOT EXISTS jamcore_remote_feed_posts_tags_idx
  ON jamcore_remote_feed_posts USING GIN (tags);

CREATE TABLE IF NOT EXISTS jamcore_remote_comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL,
  activity_id TEXT NULL,
  object_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NULL,
  actor_url TEXT NULL,
  source_host TEXT NULL,
  content TEXT NOT NULL,
  url TEXT NULL,
  target_kind TEXT NOT NULL,
  target_id INTEGER NULL,
  target_slug TEXT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_remote_comments_tenant_object_idx
  ON jamcore_remote_comments (tenant_id, object_id);

CREATE INDEX IF NOT EXISTS jamcore_remote_comments_target_id_idx
  ON jamcore_remote_comments (tenant_id, status, target_kind, target_id);

CREATE INDEX IF NOT EXISTS jamcore_remote_comments_target_slug_idx
  ON jamcore_remote_comments (tenant_id, status, target_kind, target_slug);
