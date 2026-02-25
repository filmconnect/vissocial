# Vissocial — Features Documentation

> Zadnje ažuriranje: 25. veljače 2026 — V9 Multi-User Support

## Multi-User / Project Isolation (V9)

### How It Works
- Each user gets an isolated project via `vissocial_pid` cookie (httpOnly, 30 days)
- No auth system — cookie-based isolation for testing with multiple users
- `src/lib/projectId.ts` provides: `getProjectId()`, `readProjectId()`, `setProjectIdCookie()`, `ensureProject()`
- All 19 API routes use `getProjectId()` instead of hardcoded "proj_local"

### "Nova sesija" Button
- Creates brand new project (proj_XXXXXXXXXXXX) with new cookie
- Old project stays in DB untouched (orphaned)
- Instagram disconnected, clean onboarding starts fresh

### Instagram Account Change Detection
- OAuth callback compares new ig_user_id with existing
- Same account → refresh token only, keep data
- Different account → clean old IG-sourced data (assets, analyses, products, content packs)

### Database Migration System
- Tracking table: `_migrations` (name, applied_at)
- Script: `npm run migrate` (`src/lib/sql.ts`)
- Skips already-applied migrations, runs only new ones
- Migration files: `src/db/migrations/001_complete_schema.sql`, etc.
- Production: Neon SQL Editor or `$env:DATABASE_URL="neon_url"; npm run migrate`

## Profile Analysis (/analyze/[handle])

### Endpoint
- `POST /api/analyze` — Two-phase brand analysis
- Phase 1: Scrape Instagram profile (public data)
- Phase 2: GPT-4o-mini analysis (company, services, tone, audience, USP)
- Timeout: 15s total, 10s for GPT

### UI
- Progressive reveal with staggered animations
- Skeleton loading states
- Error handling: timeout, network, not_found, generic
- Action footer: "Sounds good → Continue" / "This doesn't feel right"

### Data Flow
- Analysis stored in localStorage("analyze_result")
- Passed to /chat via `?from=analyze` query param
- Chat reads and displays context, then clears localStorage

## Chat System (/chat)

### FSM (Finite State Machine)
- States: init → onboarding → ready_to_generate → generating → calendar
- Each state has specific chips and allowed transitions
- Session stored in `chat_sessions.state` (JSONB)

### Chip Types
| Type | Behavior |
|------|----------|
| `suggestion` | Sends as chat message |
| `onboarding_option` | Sends as chat message, advances FSM |
| `product_confirm` | API call to confirm/reject, visual feedback |
| `navigation` | Router.push to href |
| `file_upload` | Opens file picker |
| `asset_delete` | Confirm dialog + API delete |

### Init Chips (V9)
```typescript
chips: [
  { type: "navigation", label: "Spoji Instagram", href: "/settings" },
  { type: "onboarding_option", label: "Nastavi bez Instagrama", value: "nastavi bez" }
]
```
**Note:** "Spoji Instagram" is `navigation` type (not `suggestion`), directs to Settings page.

### Notifications (Async)
- Frontend polls `GET /api/chat/notifications` every 5s
- Worker pushes notifications after: ingest, analyze, brand rebuild, plan generate, render complete
- Notifications contain chips for user actions

## Instagram Integration

### Requirements
- Instagram account must be **Professional** (Business or Creator) — Personal accounts cannot use Graph API
- Meta prompts user to convert if Personal account detected

### OAuth Flow (V9)
1. User clicks "Spoji Instagram" chip → navigates to /settings
2. Settings page redirects to `/api/instagram/login`
3. Login route includes `project_id` in OAuth state parameter
4. Meta OAuth flow (user authorizes)
5. Callback at `/api/instagram/callback` reads project_id from state
6. Token saved to `projects.meta_access_token`
7. `ig_connected` set to true
8. If different IG account than before → clean old data
9. Queue: `instagram.ingest` job

### Media Ingest Pipeline
1. Fetch media via Graph API (limit 25)
2. Download each image to buffer
3. Upload to Vercel Blob (`putObject` with `allowOverwrite: true`)
4. **CRITICAL:** Store Vercel Blob URL (not proxy URL) in `assets.url`
5. Queue Vision analysis for each image asset

### Vision Analysis
- GPT-4 Vision analyzes each image
- Detects products, visual style, content themes
- Saves to `instagram_analyses` and `detected_products`
- Triggers brand rebuild when all analyses complete

### Brand Rebuild
- Aggregates all analyses into unified brand profile
- Calculates: visual_style, content_themes, caption_patterns, brand_consistency
- Saves to `brand_profiles`
- Sends notification with pending product count

## Content Generation

### Plan Generation (LLM)
- Uses Thompson sampling (bandit arms) for content variety
- Generates N items (controlled by `DEV_GENERATE_LIMIT`, default 30)
- Each item: topic, caption, visual_brief, format (feed/story/reel/carousel)
- Queues render job for each item

### Image Rendering (fal.ai Flux2)
- Model: `flux-2/edit` (with reference images) or `flux/dev` (without)
- **Max 4 image_urls per request** (fal.ai hard limit)
- **Safety checker disabled** (`enable_safety_checker: false`) — prevents false positives on product images
- Priority: 1 product → 1 style → 1 character → fill remaining slot
- Smart prompt includes scene, product fidelity instructions, photography style
- Lock duration: 180s (fal.ai can be slow)

### Calendar (/calendar)
- Polls `/api/content/latest` every 4s
- **CRITICAL:** Route must have `export const dynamic = "force-dynamic"`
- Displays grid of items with thumbnail, day, format, status badges
- Click → `/item/{id}` for detail view

## Background Workers

### Queue Configuration
| Queue | Job | Concurrency | Lock Duration |
|-------|-----|-------------|---------------|
| q_ingest | instagram.ingest | 1 | 60s |
| q_analyze | analyze.instagram | 3 | 90s |
| q_brand_rebuild | brand.rebuild | 1 | 60s |
| q_llm | plan.generate | 1 | 60s |
| q_render | render.flux | 3 | **180s** |
| q_publish | schedule.tick | 3 | 60s |
| q_publish | publish.instagram | 3 | 60s |
| q_metrics | metrics.ingest | 1 | 60s |

### Worker Deployment (Railway)
- Single Node.js process running all workers
- `import 'dotenv/config'` at top for local .env loading
- Default port 3001 locally (avoids conflict with Next.js on 3000)
- Railway sets PORT automatically
- Redis connection monitoring via ioredis
- Auto-reconnect on ECONNRESET
- Queue event listeners for failed/stalled jobs

## Storage (V8 — Production)

### Hybrid System
- **Vercel Blob** (production): when `BLOB_READ_WRITE_TOKEN` exists
- **MinIO/S3** (local dev): S3Client on port 9100

### Key Rules
1. `allowOverwrite: true` — required for re-ingest
2. `makePublicUrl(uploadedUrl)` — MUST use uploadedUrl, NOT s3Key
3. Vercel Blob URLs pass through makePublicUrl unchanged
4. MinIO URLs get transformed to APP_URL proxy format
5. `APP_URL` must have NO trailing slash

### URL Validation
- Assets in DB must have `https://...blob.vercel-storage.com/...` URLs in production
- NOT `https://vissocial.vercel.app/vissocial/...` (proxy format, doesn't work)
- Vision API needs direct Vercel Blob URLs to download images

## Database (Neon PostgreSQL)

### SSL Requirement
```typescript
// src/lib/db.ts
const isNeon = config.dbUrl?.includes("neon.tech");
const sslConfig = IS_PRODUCTION || isNeon ? { rejectUnauthorized: false } : false;
export const pool = new Pool({ connectionString: config.dbUrl, ssl: sslConfig });
```

### Projects Table — Exact Column Names
| Column | Type | Note |
|--------|------|------|
| id | TEXT | Primary key (V9: dynamic "proj_XXXXXXXXXXXX") |
| meta_access_token | TEXT | IG OAuth token (NOT ig_token!) |
| ig_user_id | TEXT | Instagram user ID |
| ig_connected | BOOLEAN | Connection status |
| ig_publish_enabled | BOOLEAN | Publishing toggle |
| fb_page_id | TEXT | Facebook page ID |
| meta_token_expires_at | TIMESTAMPTZ | Token expiry |

**IMPORTANT:** Columns `ig_token`, `meta_user_id`, `ig_username` do NOT exist!

### Assets Unique Constraint (V9)
```sql
-- Per-project uniqueness (NOT global!)
CREATE UNIQUE INDEX idx_assets_project_external_id 
  ON assets(project_id, external_id) WHERE external_id IS NOT NULL;
```

## Debug & Monitoring

### Endpoints
- `GET /api/debug/pipeline-status` — Full system overview (queues, failed jobs, recent items/packs, DB status)
- `POST /api/debug/clean-failed` — Clean failed jobs from all Redis queues
- `POST /api/debug/clean-old-packs` — Delete old content packs, keep latest
- `GET /health` — Basic health check

### Full Reset Procedure
See CONTEXT.md Section 10 for complete reset SQL and steps.

## Design System

### Components (src/ui/)
- **ChatBubble.tsx** — Messages, chips, metadata cards, avatari
- **ChatLayout.tsx** — Layout wrapper with header, step indicator
- **AppHeader.tsx** — Navigation for non-chat pages
- **Button.tsx** — Primary, secondary, ghost variants
- **Card.tsx** — Card wrapper with shadow
- **Chip.tsx** — Standalone chip component
- **Avatar.tsx** — AI (sparkle) and User (initials) avatari
- **Icons.tsx** — SVG icon library
- **Input.tsx** — Input with label/error

### Design Tokens
- Primary: žuta (#FFCA28)
- Secondary: lavender (#F8F7FF)
- AI Avatar: sparkle/star gradient (NE robot)
- Shadows: card, chat, button

### Tailwind Extensions
- `.bg-gradient-lavender`
- `.shadow-chat`
- `.btn-primary`
- Custom colors: primary-50 to primary-700, lavender-50 to lavender-200
