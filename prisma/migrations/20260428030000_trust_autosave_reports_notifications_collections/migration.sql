ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS Notification_recipient_read_idx
  ON "Notification" ("recipientId", read_at, "createdAt" DESC);

ALTER TABLE "Report"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS details TEXT NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_id INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resolution TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Report_status_check'
  ) THEN
    ALTER TABLE "Report"
      ADD CONSTRAINT "Report_status_check"
      CHECK (status IN ('open', 'triaged', 'resolved', 'dismissed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Report_priority_check'
  ) THEN
    ALTER TABLE "Report"
      ADD CONSTRAINT "Report_priority_check"
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS Report_queue_idx
  ON "Report" (status, priority, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS jamcore_report_notes (
  id TEXT PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES "Report"(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jamcore_report_notes_report_idx
  ON jamcore_report_notes (report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  muted_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jamcore_post_autosaves (
  id TEXT PRIMARY KEY,
  post_id INTEGER NULL REFERENCES "Post"(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  tenant_id TEXT NULL,
  title TEXT NULL,
  content TEXT NOT NULL,
  sticky BOOLEAN NOT NULL DEFAULT FALSE,
  tags JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_post_autosaves_author_post_key
  ON jamcore_post_autosaves (tenant_id, author_id, post_id);

CREATE TABLE IF NOT EXISTS jamcore_collection_collaborators (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES jamcore_collections(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_collection_collaborators_role_check
    CHECK (role IN ('viewer', 'editor')),
  CONSTRAINT jamcore_collection_collaborators_status_check
    CHECK (status IN ('pending', 'accepted', 'declined'))
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_collection_collaborators_unique_user
  ON jamcore_collection_collaborators (collection_id, user_id);

CREATE TABLE IF NOT EXISTS jamcore_federation_trust_settings (
  tenant_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'open',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_federation_trust_mode_check
    CHECK (mode IN ('open', 'allowlist', 'moderated'))
);

CREATE TABLE IF NOT EXISTS jamcore_federation_allowlist (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL,
  allow_type TEXT NOT NULL,
  value TEXT NOT NULL,
  created_by INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jamcore_federation_allowlist_type_check
    CHECK (allow_type IN ('domain', 'actor'))
);

CREATE UNIQUE INDEX IF NOT EXISTS jamcore_federation_allowlist_unique_value
  ON jamcore_federation_allowlist (tenant_id, allow_type, value);
