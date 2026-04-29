CREATE TABLE IF NOT EXISTS jamcore_service_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scopes JSONB NOT NULL,
  tenant_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jamcore_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT NULL,
  locked_at TIMESTAMPTZ NULL,
  lock_token TEXT NULL
);

CREATE TABLE IF NOT EXISTS jamcore_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  response_status INTEGER NULL,
  response_kind TEXT NULL,
  response_body JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS jamcore_domain_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tenant_id TEXT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS jamcore_webhook_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  events JSONB NOT NULL,
  secret TEXT NULL,
  headers JSONB NULL,
  tenant_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_delivery_at TIMESTAMPTZ NULL,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS jamcore_jobs_due_idx ON jamcore_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS jamcore_events_time_idx ON jamcore_domain_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS jamcore_idempotency_expiry_idx ON jamcore_idempotency (expires_at);
