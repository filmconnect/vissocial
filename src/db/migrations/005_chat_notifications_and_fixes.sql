-- ============================================================
-- Migration: 004_chat_notifications_and_fixes.sql
-- Fixes missing columns + adds notification system
-- ============================================================

-- ============================================================
-- 1. FIX detected_products TABLE (add all possibly missing columns)
-- ============================================================

ALTER TABLE detected_products ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE detected_products ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE detected_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE detected_products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_detected_products_updated_at ON detected_products;
CREATE TRIGGER update_detected_products_updated_at
    BEFORE UPDATE ON detected_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. FIX products TABLE
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;

-- ============================================================
-- 3. ADD chat_sessions.project_id if missing
-- ============================================================

ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id);

-- Update existing sessions to have project_id
UPDATE chat_sessions SET project_id = 'proj_local' WHERE project_id IS NULL;

-- ============================================================
-- 4. CREATE chat_notifications TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  chips JSONB DEFAULT '[]'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS idx_chat_notifications_session 
  ON chat_notifications(session_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_notifications_project 
  ON chat_notifications(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_notifications_unread 
  ON chat_notifications(project_id, read) WHERE read = FALSE;

-- ============================================================
-- 5. SEED bandit_arms (if empty)
-- ============================================================

INSERT INTO bandit_arms (id, name, params) VALUES
('arm_reel_bts_story_comment_lifestyle','Reel BTS Story','{"format":"reel","pillar":"behind_the_scenes","hook_type":"story","caption_length":"medium","cta_type":"comment","scene_template":"lifestyle_soft","promo_level":0.15}'::jsonb),
('arm_reel_product_list_save_studio','Reel Product List','{"format":"reel","pillar":"product_benefit","hook_type":"list","caption_length":"short","cta_type":"save","scene_template":"studio_clean","promo_level":0.55}'::jsonb),
('arm_carousel_edu_list_save_clean','Carousel Education','{"format":"carousel","pillar":"education","hook_type":"list","caption_length":"long","cta_type":"save","scene_template":"clean_flatlay","promo_level":0.25}'::jsonb),
('arm_feed_story_question_comment_lifestyle','Feed Story','{"format":"feed","pillar":"storytelling","hook_type":"question","caption_length":"medium","cta_type":"comment","scene_template":"lifestyle_soft","promo_level":0.20}'::jsonb),
('arm_reel_ugc_testimonial_comment_ugc','Reel UGC','{"format":"reel","pillar":"ugc_testimonial","hook_type":"claim","caption_length":"short","cta_type":"comment","scene_template":"ugc_phone","promo_level":0.35}'::jsonb),
('arm_story_poll_engagement','Story Poll','{"format":"story","pillar":"engagement","hook_type":"question","caption_length":"short","cta_type":"poll","scene_template":"story_text","promo_level":0.05}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. VERIFY
-- ============================================================

SELECT 'Migration complete!' as status;

SELECT 'detected_products columns:' as info;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'detected_products' ORDER BY ordinal_position;

SELECT 'chat_notifications exists:' as info, 
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_notifications') as exists;

SELECT 'bandit_arms count:' as info, COUNT(*) as count FROM bandit_arms;


-- Ensure ON CONFLICT (project_id, language) works for brand_profiles
CREATE UNIQUE INDEX IF NOT EXISTS brand_profiles_project_id_language_uidx
ON brand_profiles(project_id, language);

-- ============================================================
-- 006_add_assets_external_id.sql
-- Add external_id to assets for external source deduplication
-- ============================================================

ALTER TABLE assets
ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_project_external_id
ON assets (project_id, external_id);

-- Optional sanity check
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'assets';
