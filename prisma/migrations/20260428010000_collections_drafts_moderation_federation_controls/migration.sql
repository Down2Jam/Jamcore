ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS draft_status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS preview_token TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Post_draft_status_check'
  ) THEN
    ALTER TABLE "Post"
      ADD CONSTRAINT "Post_draft_status_check"
      CHECK (draft_status IN ('draft', 'scheduled', 'published'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS Post_preview_token_key
  ON "Post" (preview_token)
  WHERE preview_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS Post_publication_idx
  ON "Post" (draft_status, scheduled_publish_at, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS jamcore_post_revisions (
  id TEXT PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE,
  editor_id INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sticky BOOLEAN NOT NULL DEFAULT FALSE,
  tags JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jamcore_post_revisions_post_idx
  ON jamcore_post_revisions (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_collections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL,
  owner_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_collections_visibility_check
    CHECK (visibility IN ('private', 'unlisted', 'public'))
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_collections_owner_slug_key
  ON jamcore_collections (tenant_id, owner_id, slug);

CREATE INDEX IF NOT EXISTS jamcore_collections_tenant_visibility_idx
  ON jamcore_collections (tenant_id, visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES jamcore_collections(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  note TEXT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_collection_items_type_check
    CHECK (item_type IN ('game', 'post', 'track'))
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_collection_items_unique_item
  ON jamcore_collection_items (collection_id, item_type, item_id);

CREATE INDEX IF NOT EXISTS jamcore_collection_items_collection_idx
  ON jamcore_collection_items (collection_id, position ASC, added_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_federation_blocks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL,
  block_type TEXT NOT NULL,
  value TEXT NOT NULL,
  reason TEXT NULL,
  created_by INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_federation_blocks_type_check
    CHECK (block_type IN ('domain', 'actor'))
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_federation_blocks_unique_value
  ON jamcore_federation_blocks (tenant_id, block_type, value);
