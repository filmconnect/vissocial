CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'My Project',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free','pro','enterprise')),
  plan_month TEXT,
  ig_connected BOOLEAN NOT NULL DEFAULT FALSE,
  ig_publish_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ig_user_id TEXT,
  fb_page_id TEXT,
  meta_access_token TEXT,
  meta_token_expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS brand_profiles (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'hr',
  profile JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image','video','logo')),
  source TEXT NOT NULL CHECK (source IN ('instagram','website','upload','generated')),
  url TEXT NOT NULL,
  label TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  canonical_url TEXT,
  confidence NUMERIC,
  evidence JSONB,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_packs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  content_pack_id TEXT REFERENCES content_packs(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('reel','carousel','story','feed')),
  topic TEXT NOT NULL,
  visual_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  caption JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  publish_mode TEXT NOT NULL DEFAULT 'export_only' CHECK (publish_mode IN ('export_only','in_app_schedule','auto_publish')),
  publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft','approved','scheduled','published','failed')),
  scheduled_at TIMESTAMPTZ,
  ig_media_id TEXT,
  ig_creation_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS renders (
  id TEXT PRIMARY KEY,
  content_item_id TEXT REFERENCES content_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  outputs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  progress NUMERIC,
  input JSONB,
  result JSONB,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat sessions/messages
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('assistant','user','system')),
  text TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
