# Vissocial

**AI-powered Instagram Content Management Platform**

Chat-first interface for Instagram content generation with Vision AI analysis, RL-based optimization, and automated publishing.

> **Version:** 9.0 (February 2026)
> **Branch:** `main` (production)
> **Live:** [vissocial.vercel.app](https://vissocial.vercel.app)

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS → **Vercel**
- **Backend:** Next.js API Routes, BullMQ workers → **Railway**
- **Database:** PostgreSQL → **Neon** (SSL required)
- **Storage:** MinIO (local) / Vercel Blob (production)
- **AI:** GPT-4 Vision, GPT-4o-mini, ChatGPT, fal.ai (Flux2)
- **Queue:** BullMQ + Redis → **Railway Redis**

## Features

### ✅ Implemented

**Core**
- **Chat-first UX** — Onboarding, commands, notifications all in chat
- **Instagram OAuth** — Connect professional/creator accounts
- **Vision Analysis** — GPT-4 Vision analyzes Instagram posts
- **Product Detection** — Auto-detect products with confirm/reject chips
- **Brand Profile** — Aggregated style analysis (colors, mood, patterns)
- **Content Generation** — AI generates topics, captions, visual directions
- **Image Rendering** — Flux2 via fal.ai (max 4 refs, safety checker disabled)
- **Calendar/Editor** — View, edit, approve, schedule posts
- **Export** — CSV + ZIP bundle
- **RL Loop** — Thompson sampling policy for content optimization

**V3 — Design System**
- **Landing Page** — Contently-style design with lavender gradient
- **Profile Analysis** — /analyze/[handle] with GPT-4o-mini brand analysis
- **Modern UI** — ChatBubble, ChatLayout, Button, Card, Chip components
- **AI Avatar** — Sparkle/star design (not robot)
- **Navigation** — Dual-layer (ChatLayout + AppHeader)

**V7 — Database & Storage**
- **Product Confirm UI** — Green checkmark after confirmation
- **Storage Fix** — Vercel Blob allowOverwrite for re-ingest
- **Database Fix** — external_id, analysis_id, source columns

**V8 — Production Deployment**
- **Neon PostgreSQL** — SSL configuration, connection pooling
- **Railway Worker** — BullMQ with Redis monitoring, auto-reconnect
- **Vercel Blob** — Hybrid storage with auto-detection
- **fal.ai** — Max 4 image_urls with prioritizeRefs()
- **Debug Endpoints** — Pipeline status, failed job cleanup, health check
- **force-dynamic** — All DB-reading API routes cached correctly

**V9 — Multi-User Support**
- **Dynamic Project ID** — Cookie-based isolation (`vissocial_pid`)
- **19 API routes migrated** — All use `getProjectId()` instead of hardcoded `proj_local`
- **Instagram reconnect** — Detects account changes, cleans old data
- **OAuth state param** — project_id travels through OAuth flow
- **"Nova sesija" button** — Creates new project + cookie
- **Migration tracking** — `_migrations` table, `npm run migrate` skips applied
- **Per-project unique index** — Assets deduplicated per project

### 📋 Planned

- Shopify integration
- Multi-platform support (TikTok, Facebook)
- Video generation (Luma/Runway)
- Proper auth system (replace cookie-based isolation)
- A/B testing for content

## Quick Start

```bash
# 1. Start services
docker compose up -d

# 2. Environment
cp .env.example .env
# Edit .env with your API keys

# 3. Install & migrate
npm install
npm run migrate

# 4. Run
npm run dev     # Frontend (localhost:3000)
npm run worker  # Background jobs (localhost:3001)
```

## Environment Variables

### Local Development (.env)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/vissocial
REDIS_URL=redis://localhost:6380
S3_ENDPOINT=http://localhost:9100
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=vissocial
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
FAL_KEY=...
FAL_FLUX_MODEL=flux/dev
FAL_FLUX_EDIT_MODEL=flux-2/edit
META_APP_ID=...
META_APP_SECRET=...
APP_URL=https://your-ngrok-url.ngrok-free.dev
DEV_GENERATE_LIMIT=3
```

### Production
See `docs/CONTEXT.md` for full Vercel + Railway environment variable lists.

**Critical production notes:**
- `BLOB_READ_WRITE_TOKEN` must be on BOTH Vercel and Railway
- `APP_URL` must have NO trailing slash
- `DATABASE_URL` must include `?sslmode=require`

## User Flow

```
[Landing Page] → Enter @handle
       │
       ▼
[Step 1: Profile Analysis] (/analyze/[handle])
       │   GPT-4o-mini brand analysis
       │
       ▼
[Step 2: Init] (/chat)
       │   🍪 Cookie → getProjectId() → new project
       │   [Connect Instagram] or [Continue without]
       │
       ▼
[Step 3: Instagram Ingest] (Worker pipeline)
       │   ingest → analyze (×3) → brandRebuild → notification
       │
       ▼
[Step 4: Product Confirmation] (/chat)
       │   Confirm/reject detected products
       │
       ▼
[Step 5: Onboarding] (/chat)
       │   Goal, frequency, tone, promo level
       │
       ▼
[Step 6: Content Generation] (/chat)
       │   LLM + fal.ai Flux2 rendering
       │
       ▼
[Step 7: Calendar] (/calendar)
       │   Review, edit, approve, schedule
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Vercel     │     │   Railway     │     │    Neon      │
│  (Frontend)  │────▶│  (Worker)     │────▶│ (PostgreSQL) │
│  Next.js API │     │  BullMQ jobs  │     │  SSL req.    │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │
       │                    ▼
       │            ┌──────────────┐
       │            │ Railway Redis│
       │            └──────────────┘
       ▼
┌─────────────┐     ┌──────────────┐
│ Vercel Blob │     │   fal.ai     │
│  (Storage)  │     │  (Flux2)     │
└─────────────┘     └──────────────┘
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx             # Landing page
│   ├── analyze/[handle]/    # Profile analysis
│   ├── chat/                # Chat interface
│   ├── calendar/            # Content calendar
│   ├── profile/             # Brand profile
│   └── settings/            # Instagram connection
├── ui/                      # Design system components
│   ├── ChatBubble.tsx       # Messages, chips, avatars
│   ├── ChatLayout.tsx       # Chat page layout
│   ├── AppHeader.tsx        # App navigation
│   ├── Button.tsx, Card.tsx, Chip.tsx
│   ├── Avatar.tsx, Icons.tsx, Input.tsx
│   ├── ColorPicker.tsx, MultiSelect.tsx
│   └── ProgressBar.tsx, ProductCard.tsx
├── lib/
│   ├── projectId.ts         # V9: Cookie-based project isolation
│   ├── config.ts, db.ts, storage.ts
│   └── notifications.ts, fal.ts
├── db/
│   └── migrations/          # SQL migrations
└── server/
    ├── worker.ts            # BullMQ worker entry
    └── processors/          # Job processors
```

## API Reference

### Chat
- `POST /api/chat/session` — Create session
- `GET /api/chat/session` — Load session
- `POST /api/chat/message` — Send message (FSM)
- `GET /api/chat/notifications` — Poll notifications
- `POST /api/chat/notifications` — Mark read
- `POST /api/chat/reset` — New session (new project + cookie)

### Instagram
- `GET /api/instagram/login` — Start OAuth (project_id in state)
- `GET /api/instagram/callback` — OAuth callback
- `POST /api/instagram/scrape` — Web scraping

### Content
- `GET /api/content/latest` — Latest content pack
- `GET /api/content/item` — Single item
- `PATCH /api/content/item` — Update item
- `POST /api/content/regenerate` — Regenerate

### Products
- `GET /api/products` — List products
- `GET /api/products/pending` — Pending products
- `POST /api/products/confirm` — Confirm product
- `POST /api/products/reject` — Reject product
- `PATCH /api/products/[id]` — Update (name, category, locked)
- `DELETE /api/products/[id]` — Delete product

### Profile
- `GET /api/profile` — Brand profile + metadata
- `PATCH /api/profile` — Update brand profile
- `POST /api/profile/rebuild` — Trigger rebuild

### Assets
- `POST /api/assets/upload` — Upload (FormData: file + label)
- `GET /api/assets/references` — Reference images by type
- `POST /api/assets/presign` — Presigned URL
- `DELETE /api/assets/[id]` — Delete asset

### Analyze
- `POST /api/analyze` — Two-phase brand analysis
- `GET /api/analyze/status` — Analysis status
- `POST /api/analyze/trigger` — Trigger analysis

### Other
- `POST /api/scrape/website` — Web scraping
- `POST /api/export` — ZIP export (CSV + media)
- `GET /api/projects/me` — Current project info
- `GET /api/debug/pipeline-status` — Queue status
- `GET /health` — Health check

## Worker Jobs

| Queue | Job | Concurrency | Lock |
|-------|-----|-------------|------|
| q_ingest | instagram.ingest | 1 | 60s |
| q_analyze | analyze.instagram | 3 | 90s |
| q_brand_rebuild | brand.rebuild | 1 | 60s |
| q_llm | plan.generate | 1 | 120s |
| q_render | render.flux | 3 | 180s |
| q_export | export.pack | 1 | 60s |
| q_publish | schedule.tick | 3 | 60s |
| q_publish | publish.instagram | 3 | 60s |
| q_metrics | metrics.ingest | 1 | 60s |

## Development Notes

### ngrok for Development
Instagram OAuth requires HTTPS:
```bash
ngrok http 3000
# Update APP_URL in .env
```

### Key Ports
- **Next.js:** 3000
- **Worker:** 3001 (avoids conflict)
- **Redis:** 6380 (not 6379!)
- **MinIO:** 9100

### Storage
- **Local:** MinIO on port 9100
- **Production:** Vercel Blob (auto-detected via BLOB_READ_WRITE_TOKEN)
- **Important:** `allowOverwrite: true` required for re-ingest
- **Critical:** Use `makePublicUrl(uploadedUrl)` not `makePublicUrl(s3Key)`

### Project ID
Dynamic via cookie `vissocial_pid`. All routes use `getProjectId()`.

### Database Migrations
```bash
npm run migrate  # Skips already-applied migrations via _migrations table
```

## Changelog

### v9.0.0 (2026-02-25)
- ✅ Multi-user support — Cookie-based project isolation
- ✅ 19 API routes migrated to dynamic project_id
- ✅ Instagram reconnect detection
- ✅ Migration tracking system
- ✅ fal.ai safety checker disabled (false positives on product images)

### v8.0.0 (2026-02-24)
- ✅ Production deployment — Vercel + Railway + Neon
- ✅ SSL configuration for Neon PostgreSQL
- ✅ Storage URL fix (Vercel Blob passthrough)
- ✅ Redis monitoring with auto-reconnect
- ✅ Debug endpoints for pipeline monitoring

### v7.0.0 (2026-02-07)
- ✅ Product confirm green checkmark
- ✅ Database columns: external_id, analysis_id, source
- ✅ Vercel Blob allowOverwrite fix

### v3.0.0 (2026-02-07)
- ✅ Design System Migration (Contently-style)
- ✅ Profile Analysis page (/analyze/[handle])
- ✅ Modern UI components

### v2.0.0 (2026-02-02)
- ✅ Async notifications system
- ✅ Worker lock duration fix

### v1.0.0
- Initial release — Chat, OAuth, Vision, Content Generation, Calendar

## Documentation

- [CONTEXT.md](docs/CONTEXT.md) — Complete project context (authoritative source)
- [FEATURES.md](docs/FEATURES.md) — Feature documentation
- [ROADMAP.md](docs/ROADMAP.md) — Development roadmap

## License

MIT
