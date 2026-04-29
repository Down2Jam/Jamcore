CREATE TABLE IF NOT EXISTS jamcore_radio_sessions (
  tenant_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  current_track_id INTEGER NULL REFERENCES "GamePageTrack"(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 180,
  vote_round TEXT NOT NULL,
  vote_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jamcore_radio_votes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  vote_round TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES "GamePageTrack"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vote_round, user_id)
);

CREATE INDEX IF NOT EXISTS jamcore_radio_votes_round_idx
  ON jamcore_radio_votes (tenant_id, vote_round, track_id);

CREATE TABLE IF NOT EXISTS jamcore_radio_emotes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  emote TEXT NOT NULL,
  x DOUBLE PRECISION NULL,
  y DOUBLE PRECISION NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jamcore_radio_emotes_recent_idx
  ON jamcore_radio_emotes (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jamcore_radio_bans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  track_id INTEGER NOT NULL REFERENCES "GamePageTrack"(id) ON DELETE CASCADE,
  reason TEXT NULL,
  created_by INTEGER NULL REFERENCES "User"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, track_id)
);
