CREATE TABLE IF NOT EXISTS bandit_arms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_features (
  content_item_id TEXT PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  arm_id TEXT REFERENCES bandit_arms(id),
  features JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_actions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  content_item_id TEXT REFERENCES content_items(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_metrics (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  content_item_id TEXT REFERENCES content_items(id) ON DELETE CASCADE,
  time_window TEXT NOT NULL CHECK (time_window IN ('1h','24h','7d')),
  metrics JSONB NOT NULL,
  reward_01 NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO bandit_arms (id, name, params) VALUES
('arm_reel_bts_story_comment_lifestyle','Reel BTS Story','{"format":"reel","pillar":"behind_the_scenes","hook_type":"story","caption_length":"medium","cta_type":"comment","scene_template":"lifestyle_soft","promo_level":0.15}'::jsonb),
('arm_reel_product_list_save_studio','Reel Product List','{"format":"reel","pillar":"product_benefit","hook_type":"list","caption_length":"short","cta_type":"save","scene_template":"studio_clean","promo_level":0.55}'::jsonb),
('arm_carousel_edu_list_save_clean','Carousel Education','{"format":"carousel","pillar":"education","hook_type":"list","caption_length":"long","cta_type":"save","scene_template":"clean_flatlay","promo_level":0.25}'::jsonb),
('arm_feed_story_question_comment_lifestyle','Feed Story','{"format":"feed","pillar":"storytelling","hook_type":"question","caption_length":"medium","cta_type":"comment","scene_template":"lifestyle_soft","promo_level":0.20}'::jsonb),
('arm_reel_ugc_testimonial_comment_ugc','Reel UGC','{"format":"reel","pillar":"ugc_testimonial","hook_type":"claim","caption_length":"short","cta_type":"comment","scene_template":"ugc_phone","promo_level":0.35}'::jsonb),
('arm_story_poll_engagement','Story Poll','{"format":"story","pillar":"engagement","hook_type":"question","caption_length":"short","cta_type":"poll","scene_template":"story_text","promo_level":0.05}'::jsonb)
ON CONFLICT (id) DO NOTHING;
