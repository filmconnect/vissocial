-- ============================================================
-- VISSOCIAL MIGRATION: Vision Analysis + Event-Driven Rebuild
-- ============================================================
-- Run this file to add all new tables at once
-- Compatible with existing schema from migrations 001-002
-- ============================================================

BEGIN;

-- ============================================================
-- 1. INSTAGRAM ANALYSES TABLE
-- ============================================================
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

-- ============================================================
-- 2. DETECTED PRODUCTS TABLE
-- ============================================================
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

-- ============================================================
-- 3. BRAND REBUILD EVENTS TABLE
-- ============================================================
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
-- 4. HELPER VIEW: Detected Products Summary
-- ============================================================
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
-- 5. HELPER FUNCTIONS
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
-- 6. TRIGGER: Auto-mark as 'ready' when analyses complete
-- ============================================================
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
-- DONE
-- ============================================================
COMMIT;

-- Verify tables exist
SELECT 'instagram_analyses' as table_name, COUNT(*) as row_count FROM instagram_analyses
UNION ALL
SELECT 'detected_products', COUNT(*) FROM detected_products
UNION ALL
SELECT 'brand_rebuild_events', COUNT(*) FROM brand_rebuild_events;
