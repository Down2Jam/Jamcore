CREATE TABLE IF NOT EXISTS jamcore_collection_comments (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES jamcore_collections(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jamcore_collection_comments_collection_idx
  ON jamcore_collection_comments (collection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_collection_follows (
  collection_id TEXT NOT NULL REFERENCES jamcore_collections(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, user_id)
);

CREATE INDEX IF NOT EXISTS jamcore_collection_follows_user_idx
  ON jamcore_collection_follows (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_collection_imports (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES jamcore_collections(id) ON DELETE CASCADE,
  imported_by INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  source_name TEXT NULL,
  source_format TEXT NOT NULL DEFAULT 'jamcore',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jamcore_post_series (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL,
  owner_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_post_series_visibility_check
    CHECK (visibility IN ('private', 'unlisted', 'public'))
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_post_series_owner_slug_key
  ON jamcore_post_series (tenant_id, owner_id, slug);

CREATE INDEX IF NOT EXISTS jamcore_post_series_discovery_idx
  ON jamcore_post_series (tenant_id, visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_post_series_posts (
  series_id TEXT NOT NULL REFERENCES jamcore_post_series(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series_id, post_id)
);

CREATE INDEX IF NOT EXISTS jamcore_post_series_posts_post_idx
  ON jamcore_post_series_posts (post_id);
