-- ============================================================
-- Migration: 003_schema_alignment.sql
-- Purpose: Align database schema with code expectations
-- Safe to re-run: All statements are idempotent
-- ============================================================

BEGIN;

-- ============================================================
-- 1. assets - Add external_id for duplicate detection
-- ============================================================

ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_external_id_project 
ON assets(project_id, external_id) 
WHERE external_id IS NOT NULL;

-- ============================================================
-- 2. instagram_analyses - Ensure correct constraints
-- Schema: id, asset_id, analysis, model_version, tokens_used, analyzed_at
-- NOTE: We do NOT add project_id - use JOIN via asset_id
-- ============================================================

-- Ensure UNIQUE constraint for ON CONFLICT
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'instagram_analyses_asset_id_key'
  ) THEN
    ALTER TABLE instagram_analyses 
    ADD CONSTRAINT instagram_analyses_asset_id_key UNIQUE (asset_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_instagram_analyses_asset ON instagram_analyses(asset_id);
CREATE INDEX IF NOT EXISTS idx_instagram_analyses_date ON instagram_analyses(analyzed_at DESC);

-- ============================================================
-- 3. detected_products - Add missing columns
-- ============================================================

ALTER TABLE detected_products 
ADD COLUMN IF NOT EXISTS analysis_id TEXT;

ALTER TABLE detected_products 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'instagram_vision';

ALTER TABLE detected_products 
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE detected_products 
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE detected_products 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE detected_products 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Ensure UNIQUE constraint for ON CONFLICT (asset_id, product_name)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'detected_products_asset_id_product_name_key'
  ) THEN
    ALTER TABLE detected_products 
    ADD CONSTRAINT detected_products_asset_id_product_name_key 
    UNIQUE (asset_id, product_name);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_detected_products_project ON detected_products(project_id, status);
CREATE INDEX IF NOT EXISTS idx_detected_products_pending ON detected_products(project_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_detected_products_analysis ON detected_products(analysis_id) WHERE analysis_id IS NOT NULL;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_detected_products_updated_at ON detected_products;
CREATE TRIGGER trg_detected_products_updated_at
    BEFORE UPDATE ON detected_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. products - Add category column
-- ============================================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS category TEXT;

-- ============================================================
-- 5. brand_profiles - Ensure proper constraints
-- ============================================================

ALTER TABLE brand_profiles 
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'hr';

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_profiles_project_language 
ON brand_profiles(project_id, language);

-- ============================================================
-- 6. chat_sessions - Ensure project_id exists
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chat_sessions' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE chat_sessions 
    ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;

UPDATE chat_sessions SET project_id = 'proj_local' WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_id, created_at DESC);

-- ============================================================
-- 7. bandit_arms - Seed if empty
-- ============================================================

INSERT INTO bandit_arms (id, name, params) VALUES
('arm_reel_bts_story_comment_lifestyle','Reel BTS Story','{"format":"reel","pillar":"behind_the_scenes","hook_type":"story","caption_length":"medium","cta_type":"comment","scene_template":"lifestyle_soft","promo_level":0.15}'::jsonb),
('arm_reel_product_list_save_studio','Reel Product List','{"format":"reel","pillar":"product_benefit","hook_type":"list","caption_length":"short","cta_type":"save","scene_template":"studio_clean","promo_level":0.55}'::jsonb),
('arm_carousel_edu_list_save_clean','Carousel Education','{"format":"carousel","pillar":"education","hook_type":"list","caption_length":"long","cta_type":"save","scene_template":"clean_flatlay","promo_level":0.25}'::jsonb),
('arm_feed_story_question_comment_lifestyle','Feed Story','{"format":"feed","pillar":"storytelling","hook_type":"question","caption_length":"medium","cta_type":"comment","scene_template":"lifestyle_soft","promo_level":0.20}'::jsonb),
('arm_reel_ugc_testimonial_comment_ugc','Reel UGC','{"format":"reel","pillar":"ugc_testimonial","hook_type":"claim","caption_length":"short","cta_type":"comment","scene_template":"ugc_phone","promo_level":0.35}'::jsonb),
('arm_story_poll_engagement','Story Poll','{"format":"story","pillar":"engagement","hook_type":"question","caption_length":"short","cta_type":"poll","scene_template":"story_text","promo_level":0.05}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT 'Migration 003 complete!' as status;
