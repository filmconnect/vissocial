# Features (Implemented)

## Chat-first UX

### Onboarding Flow
- Finite-state chat: goal → planned posts → profile type → focus → horizon
- Clickable chips for quick responses
- Supports both string chips (legacy) and ChatChip objects

### Chat Commands
- `generiraj plan` / `generate` → Queue content plan generation
- `poveži instagram` → Redirect to Settings for OAuth
- `export` → Generate CSV + ZIP bundle
- `metrics` / `insights` → Queue metrics collection
- `status` → Show current analysis/generation status
- `prikaži proizvode` → Display detected products for confirmation

### Async Notifications
- Worker processes push notifications to chat
- Frontend polls every 5 seconds
- Notifications include actionable chips
- Auto-marked as read when displayed

## Instagram Integration

### OAuth Flow
1. User clicks "Connect Instagram" in Settings
2. Redirect to Meta OAuth
3. Exchange code for access token
4. Discover connected professional account via Page
5. Store long-lived token (59 days)

### Media Ingest
- Fetches last 25 media items
- Downloads images to MinIO storage
- Queues Vision analysis for each image
- Supports IMAGE and CAROUSEL_ALBUM types

### Publishing
- Toggle: `ENABLE_INSTAGRAM_PUBLISH` + per-project `ig_publish_enabled`
- Uses Media Container API for publishing
- Supports scheduled publishing via `schedule.tick`

## Vision Analysis

### GPT-4 Vision Integration
- Analyzes each Instagram image
- Extracts: visual style, products, brand elements, quality
- Stores raw JSON for flexibility

### Product Detection
- Auto-detects products from images
- Stores in `detected_products` table
- User confirms/rejects via chat chips
- Confirmed products go to `products` table

### Brand Profile Aggregation
- Aggregates all analyses into brand profile
- Calculates: dominant colors, photography style, mood
- Tracks caption patterns and consistency scores
- Event-driven rebuild on analysis completion

## Content Generation

### Plan Generation
- Uses ChatGPT for topic/caption/visual direction
- Thompson sampling selects content format
- Supports multiple formats: feed, reel, carousel, story

### Visual Rendering
- Flux2 via fal.ai generates preview images
- Prompt includes scene description + on-screen text
- Negative prompts for quality control

### Multi-reference Support
- Upload reference images labeled:
  - `style_reference` - Visual style
  - `product_reference` - Product shots
  - `character_reference` - People/mascots
- Up to 8 references used in generation

## Calendar/Editor

### Monthly View
- Grid of content items by day
- Thumbnail previews when rendered
- Status badges (draft, approved, scheduled, published)

### Item Editor
- Edit caption (short/long)
- Set publish mode (export only, schedule, auto-publish)
- Set scheduled time
- Approve/unapprove
- Regenerate with custom instruction
- Publish now (manual)

## Export

### Bundle Contents
- CSV with all item metadata
- ZIP containing:
  - Individual caption.txt files
  - Rendered images (when available)

### Options
- Filter: approved only vs all
- Future: S3 signed URLs instead of data URLs

## RL Loop (Thompson Sampling)

### Policy Service
- FastAPI microservice
- Thompson sampling with Beta distribution
- Per-project, per-period state

### Arms Configuration
- 6 default arms with different:
  - Format (reel, carousel, feed, story)
  - Pillar (product, education, UGC, storytelling)
  - Hook type (story, list, question, claim)
  - CTA type (comment, save, poll)
  - Scene template

### Feedback Loop
1. Content generated with arm assignment
2. Published to Instagram
3. Metrics collected at 1h, 24h, 7d
4. Reward computed (normalized engagement)
5. Policy updated with reward

## UI Components

### ChatChip
- Types: suggestion, onboarding_option, product_confirm, navigation
- States: default, loading, confirmed, rejected
- Icons: ➕ (before confirm), ✅ (after confirm), ❌ (rejected)

### Cards & Badges
- Consistent card styling
- Tone-based badges (info, good, warn, neutral)

## Background Workers

### Queue Configuration
- `lockDuration: 60000` (60s) prevents lock expiration
- `stalledInterval: 30000` detects stuck jobs
- `concurrency` varies by queue type

### Job Types
| Queue | Job | Concurrency |
|-------|-----|-------------|
| q_ingest | instagram.ingest | 1 |
| q_analyze | analyze.instagram | 3 |
| q_brand_rebuild | brand.rebuild | 1 |
| q_llm | plan.generate | 1 |
| q_render | render.flux | 3 |
| q_publish | schedule.tick | 3 |
| q_publish | publish.instagram | 3 |
| q_metrics | metrics.ingest | 1 |
