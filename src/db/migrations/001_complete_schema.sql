-- ============================================================
-- VISSOCIAL - COMPLETE DATABASE SCHEMA
-- ============================================================
-- Version: 1.0.0
-- Date: 2026-02-03
-- Description: Konsolidirana migracija sa svim tablicama
-- 
-- UPUTE ZA KORIŠTENJE:
-- 1. Obriši sve iz src/db/migrations/ (ili ih premjesti u backup/)
-- 2. Kopiraj ovu datoteku kao src/db/migrations/001_complete_schema.sql
-- 3. Pokreni: npm run migrate
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CORE TABLES
-- ============================================================

-- Projects - glavni entitet
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'My Project',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free','pro','enterprise')),
  plan_month TEXT,
  -- Instagram integration
  ig_connected BOOLEAN NOT NULL DEFAULT FALSE,
  ig_publish_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ig_user_id TEXT,
  fb_page_id TEXT,
  meta_access_token TEXT,
  meta_token_expires_at TIMESTAMPTZ
);

-- Brand profiles - AI-generirani brand profili
CREATE TABLE IF NOT EXISTS brand_profiles (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'hr',
  profile JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Assets - slike, videi, logotipovi
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

CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_source ON assets(source);

-- Products - potvrđeni proizvodi
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  canonical_url TEXT,
  confidence NUMERIC,
  evidence JSONB,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id);

-- ============================================================
-- 2. CONTENT GENERATION TABLES
-- ============================================================

-- Content packs - mjesečni paketi
CREATE TABLE IF NOT EXISTS content_packs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Content items - pojedinačne objave
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

CREATE INDEX IF NOT EXISTS idx_content_items_pack ON content_items(content_pack_id);
CREATE INDEX IF NOT EXISTS idx_content_items_project ON content_items(project_id);

-- Renders - fal.ai renderovi
CREATE TABLE IF NOT EXISTS renders (
  id TEXT PRIMARY KEY,
  content_item_id TEXT REFERENCES content_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  outputs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jobs - background job tracking
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

-- ============================================================
-- 3. CHAT SYSTEM TABLES
-- ============================================================

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('assistant','user','system')),
  text TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

-- Chat notifications - za async notifikacije u chat
CREATE TABLE IF NOT EXISTS chat_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  data JSONB DEFAULT '{}',
  chips JSONB DEFAULT '[]',
  payload JSONB NOT NULL DEFAULT '{}',  -- legacy, keep for backward compat
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_notifications_session ON chat_notifications(session_id, read);
CREATE INDEX IF NOT EXISTS idx_chat_notifications_unread ON chat_notifications(session_id) WHERE read = FALSE;

-- ============================================================
-- 4. RL POLICY TABLES (Thompson Sampling)
-- ============================================================

-- Bandit arms - strategije za content generiranje
CREATE TABLE IF NOT EXISTS bandit_arms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policy snapshots
CREATE TABLE IF NOT EXISTS policy_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Content features - veza content_item -> arm
CREATE TABLE IF NOT EXISTS content_features (
  content_item_id TEXT PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES bandit_arms(id),
  features JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User actions tracking
CREATE TABLE IF NOT EXISTS user_actions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  content_item_id TEXT REFERENCES content_items(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Post metrics - Instagram insights
CREATE TABLE IF NOT EXISTS post_metrics (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  content_item_id TEXT REFERENCES content_items(id) ON DELETE CASCADE,
  time_window TEXT NOT NULL CHECK (time_window IN ('1h','24h','7d')),
  metrics JSONB NOT NULL,
  reward_01 NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. VISION ANALYSIS TABLES
-- ============================================================

-- Instagram analyses - GPT-4 Vision rezultati
CREATE TABLE IF NOT EXISTS instagram_analyses (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  analysis JSONB NOT NULL,
  model_version TEXT DEFAULT 'gpt-4o',
  tokens_used INTEGER,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_analyses_asset ON instagram_analyses(asset_id);
CREATE INDEX IF NOT EXISTS idx_instagram_analyses_date ON instagram_analyses(analyzed_at DESC);

-- Detected products - AI-detektirani proizvodi (prije potvrde)
CREATE TABLE IF NOT EXISTS detected_products (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  category TEXT,
  visual_features JSONB,
  prominence TEXT CHECK (prominence IN ('high', 'medium', 'low')),
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  frequency INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  UNIQUE(asset_id, product_name)
);

CREATE INDEX IF NOT EXISTS idx_detected_products_project ON detected_products(project_id, status);
CREATE INDEX IF NOT EXISTS idx_detected_products_name ON detected_products(product_name);
CREATE INDEX IF NOT EXISTS idx_detected_products_confidence ON detected_products(confidence DESC);

-- Brand rebuild events - tracking rebuild procesa
CREATE TABLE IF NOT EXISTS brand_rebuild_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'instagram_ingest',
    'analysis_complete',
    'product_confirmed',
    'product_rejected',
    'manual_update',
    'onboarding_complete',
    'reference_uploaded'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'analyzing',
    'ready',
    'rebuilding',
    'completed',
    'failed',
    'skipped'
  )),
  total_expected INTEGER DEFAULT 0,
  analyses_completed INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_brand_rebuild_events_project ON brand_rebuild_events(project_id, status);
CREATE INDEX IF NOT EXISTS idx_brand_rebuild_events_trigger ON brand_rebuild_events(trigger_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brand_rebuild_events_pending ON brand_rebuild_events(status) WHERE status IN ('pending', 'ready');

-- ============================================================
-- 6. VIEWS
-- ============================================================

-- Detected products summary view
CREATE OR REPLACE VIEW detected_products_summary AS
SELECT 
  project_id,
  product_name,
  category,
  COUNT(*) as detection_count,
  MAX(confidence) as max_confidence,
  AVG(confidence) as avg_confidence,
  MIN(first_seen_at) as first_seen,
  MAX(last_seen_at) as last_seen,
  array_agg(DISTINCT asset_id) as asset_ids
FROM detected_products
WHERE status = 'pending'
GROUP BY project_id, product_name, category
ORDER BY detection_count DESC, max_confidence DESC;

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Function: Check if rebuild is needed
CREATE OR REPLACE FUNCTION should_trigger_rebuild(p_project_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_pending_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_pending_count
  FROM brand_rebuild_events
  WHERE project_id = p_project_id 
    AND status IN ('pending', 'ready');
  
  RETURN v_pending_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function: Get latest rebuild status
CREATE OR REPLACE FUNCTION get_rebuild_status(p_project_id TEXT)
RETURNS TABLE (
  event_id TEXT,
  trigger_type TEXT,
  status TEXT,
  progress NUMERIC,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.trigger_type,
    e.status,
    CASE 
      WHEN e.total_expected > 0 
      THEN (e.analyses_completed::NUMERIC / e.total_expected * 100)
      ELSE 0
    END as progress,
    e.created_at
  FROM brand_rebuild_events e
  WHERE e.project_id = p_project_id
  ORDER BY e.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. TRIGGERS
-- ============================================================

-- Trigger: Auto-mark rebuild as 'ready' when analyses complete
CREATE OR REPLACE FUNCTION check_analyses_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.analyses_completed >= NEW.total_expected 
     AND NEW.total_expected > 0 
     AND NEW.status = 'analyzing' THEN
    NEW.status := 'ready';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_analyses_complete ON brand_rebuild_events;

CREATE TRIGGER trg_check_analyses_complete
  BEFORE UPDATE ON brand_rebuild_events
  FOR EACH ROW
  EXECUTE FUNCTION check_analyses_complete();

-- ============================================================
-- 9. SEED DATA
-- ============================================================

-- Insert bandit arms (RL strategies)
INSERT INTO bandit_arms (id, name, params) VALUES
  ('arm_reel_bts_story_comment_lifestyle', 'Reel BTS Story', 
   '{"format":"reel","pillar":"behind_the_scenes","hook_type":"story","caption_length":"medium","cta_type":"comment","scene_template":"lifestyle_soft","promo_level":0.15}'::jsonb),
  ('arm_reel_product_list_save_studio', 'Reel Product List', 
   '{"format":"reel","pillar":"product_benefit","hook_type":"list","caption_length":"short","cta_type":"save","scene_template":"studio_clean","promo_level":0.55}'::jsonb),
  ('arm_carousel_edu_list_save_clean', 'Carousel Education', 
   '{"format":"carousel","pillar":"education","hook_type":"list","caption_length":"long","cta_type":"save","scene_template":"clean_flatlay","promo_level":0.25}'::jsonb),
  ('arm_feed_story_question_comment_lifestyle', 'Feed Story', 
   '{"format":"feed","pillar":"storytelling","hook_type":"question","caption_length":"medium","cta_type":"comment","scene_template":"lifestyle_soft","promo_level":0.20}'::jsonb),
  ('arm_reel_ugc_testimonial_comment_ugc', 'Reel UGC', 
   '{"format":"reel","pillar":"ugc_testimonial","hook_type":"claim","caption_length":"short","cta_type":"comment","scene_template":"ugc_phone","promo_level":0.35}'::jsonb),
  ('arm_story_poll_engagement', 'Story Poll', 
   '{"format":"story","pillar":"engagement","hook_type":"question","caption_length":"short","cta_type":"poll","scene_template":"story_text","promo_level":0.05}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DONE
-- ============================================================

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================
-- Uncomment these to verify tables were created:
--
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' ORDER BY table_name;
--
-- SELECT COUNT(*) as bandit_arms_count FROM bandit_arms;
