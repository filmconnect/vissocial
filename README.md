# Vissocial

**AI-powered Instagram Content Management Platform**

Chat-first interface for Instagram content generation with Vision AI analysis, RL-based optimization, and automated publishing.

> **Version:** 3.0 (February 2026)
> **Branch:** `feature/design_initial`

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, BullMQ workers
- **Database:** PostgreSQL
- **Storage:** MinIO (local) / Vercel Blob (production)
- **AI:** GPT-4 Vision, GPT-4o-mini, ChatGPT, fal.ai (Flux2)
- **Queue:** BullMQ + Redis

## Features

### ✅ Implemented

**Core**
- **Chat-first UX** — Onboarding, commands, notifications all in chat
- **Instagram OAuth** — Connect professional/business accounts
- **Vision Analysis** — GPT-4 Vision analyzes Instagram posts
- **Product Detection** — Auto-detect products from images
- **Brand Profile** — Aggregated style analysis (colors, mood, patterns)
- **Content Generation** — AI generates topics, captions, visual directions
- **Image Rendering** — Flux2 via fal.ai creates preview images
- **Calendar/Editor** — View, edit, approve, schedule posts
- **Export** — CSV + ZIP bundle
- **RL Loop** — Thompson sampling policy for content optimization

**V3 — Design System**
- **Landing Page** — Contently-style design with lavender gradient
- **Profile Analysis** — /analyze/[handle] with GPT-4o-mini brand analysis
- **Modern UI** — ChatBubble, ChatLayout, Button, Card, Chip components
- **AI Avatar** — Sparkle/star design (not robot)
- **Navigation** — Dual-layer (ChatLayout + AppHeader)
- **Progressive Loading** — Skeleton states, staggered fade-in animations

**V7 — Fixes**
- **Product Confirm UI** — Green checkmark after confirmation
- **Storage Fix** — Vercel Blob allowOverwrite for re-ingest
- **Database Fix** — external_id, analysis_id columns

### 🚧 In Progress

- Polish & cleanup
- Profile screen enhancement
- Toast notifications

### 📋 Planned

- Multi-platform support (TikTok, Facebook)
- Video generation (Luma/Runway)
- Real posting scheduler UI

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
npm run worker  # Background jobs
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vissocial

# Redis (BullMQ) — NOTE: port 6380!
REDIS_URL=redis://localhost:6380

# Storage - Local (MinIO)
S3_ENDPOINT=http://localhost:9100
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=vissocial

# Storage - Production (Vercel Blob)
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# AI
OPENAI_API_KEY=sk-...
FAL_KEY=...

# Instagram
META_APP_ID=...
META_APP_SECRET=...
APP_URL=https://your-ngrok-url.ngrok-free.dev

# Optional
ENABLE_INSTAGRAM_PUBLISH=false
DEV_GENERATE_LIMIT=3
POLICY_URL=http://localhost:8001
```

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      VISSOCIAL USER JOURNEY                      │
└─────────────────────────────────────────────────────────────────┘

[Landing Page] → Enter @handle
       │
       ▼
[Step 1: Profile Analysis] (/analyze/[handle])
       │   GPT-4o-mini brand analysis
       │   USP, tone, audience, recommendations
       │
       ▼
[Step 2: Connect Instagram] (/chat)
       │   OAuth or manual flow
       │
       ▼
[Step 3: Tailor 30-Day Plan] (/chat)
       │   Goal, profile type, focus selection
       │
       ▼
[Step 4: Product Confirmation] (/chat)
       │   Confirm/reject detected products
       │
       ▼
[Step 5: Content Generation] (/chat)
       │   AI generates plan + renders images
       │
       ▼
[Step 6: Calendar] (/calendar)
       │   Review, edit, approve, schedule
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Next.js App                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │    /     │  │ /analyze │  │  /chat   │  │/calendar │        │
│  │ Landing  │  │ Analysis │  │   Chat   │  │ Calendar │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│  ┌────▼─────────────▼─────────────▼─────────────▼────┐         │
│  │                  API Routes                        │         │
│  │  /api/analyze  /api/chat  /api/instagram  /api/*  │         │
│  └────┬─────────────┬─────────────┬─────────────┬────┘         │
└───────┼─────────────┼─────────────┼─────────────┼───────────────┘
        │             │             │             │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────────────▼───┐
   │PostgreSQL│   │  Redis  │   │ MinIO / Vercel Blob │
   └────┬────┘   └────┬────┘   └─────────────────────┘
        │             │
        │        ┌────▼────────────────────────────┐
        │        │        BullMQ Workers           │
        │        │  ┌────────┐  ┌────────┐        │
        │        │  │ ingest │  │ render │        │
        │        │  └────────┘  └────────┘        │
        │        │  ┌────────┐  ┌────────┐        │
        └────────┤  │analyze │  │ brand  │        │
                 │  └────────┘  └────────┘        │
                 │  ┌────────┐  ┌────────┐        │
                 │  │  plan  │  │publish │        │
                 │  └────────┘  └────────┘        │
                 └────────────────────────────────┘
```

## Project Structure

```
src/
├── app/
│   ├── globals.css          # Design tokens + Tailwind
│   ├── layout.tsx           # Root layout + AppHeader
│   ├── page.tsx             # Landing page
│   ├── analyze/
│   │   └── [handle]/        # Profile analysis
│   ├── chat/                # Chat interface
│   ├── calendar/            # Content calendar
│   ├── profile/             # Brand profile
│   └── settings/            # Instagram connection
├── ui/                      # Design system components
│   ├── ChatBubble.tsx
│   ├── ChatLayout.tsx
│   ├── AppHeader.tsx
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Chip.tsx
│   ├── Avatar.tsx
│   ├── Icons.tsx
│   └── Input.tsx
├── lib/                     # Utilities
│   ├── config.ts
│   ├── db.ts
│   ├── storage.ts
│   └── notifications.ts
└── server/
    └── processors/          # BullMQ workers
```

## Database Schema

### Core Tables
- `projects` — Multi-tenant projects
- `brand_profiles` — Aggregated brand analysis
- `assets` — Images/videos (+ external_id for dedup)
- `products` — Confirmed products

### Content Tables
- `content_packs` — Monthly content plans
- `content_items` — Individual posts
- `renders` — fal.ai render outputs

### Analysis Tables
- `instagram_analyses` — Vision API results
- `detected_products` — Auto-detected products (+ analysis_id, source)
- `brand_rebuild_events` — Async rebuild tracking

### Chat Tables
- `chat_sessions` — User chat sessions (FSM state)
- `chat_messages` — Message history
- `chat_notifications` — Async worker notifications

## API Reference

### Analyze (V3 — NEW)
- `POST /api/analyze` — Two-phase brand analysis (scrape + GPT)

### Chat
- `POST /api/chat/session` — Create session
- `GET /api/chat/session?session_id=X` — Load session
- `POST /api/chat/message` — Send message (FSM)
- `GET /api/chat/notifications?session_id=X` — Poll notifications
- `POST /api/chat/reset` — Reset session

### Instagram
- `GET /api/instagram/login` — Start OAuth
- `GET /api/instagram/callback` — OAuth callback
- `POST /api/instagram/scrape` — Web scraping

### Content
- `GET /api/content/latest` — Get latest content pack
- `GET /api/content/item?item_id=X` — Get single item
- `PATCH /api/content/item` — Update item

### Products
- `POST /api/products/confirm` — Confirm detected product
- `POST /api/products/reject` — Reject detected product

### Profile
- `GET /api/profile` — Get brand profile
- `PATCH /api/profile` — Update brand profile
- `POST /api/profile/rebuild` — Trigger rebuild

## Worker Jobs

| Queue | Job | Description |
|-------|-----|-------------|
| q_ingest | instagram.ingest | Fetch Instagram media |
| q_analyze | analyze.instagram | Vision API analysis |
| q_brand_rebuild | brand.rebuild | Aggregate brand profile |
| q_llm | plan.generate | Generate content plan |
| q_render | render.flux | Render images via fal.ai |
| q_publish | schedule.tick | Check scheduled posts |
| q_publish | publish.instagram | Publish to Instagram |
| q_metrics | metrics.ingest | Pull performance metrics |

## Development Notes

### ngrok for Development
Instagram OAuth requires HTTPS:
```bash
ngrok http 3000
# Update APP_URL in .env
```

### Redis Port
Default is **6380** (not 6379) to avoid conflicts.

### Storage
- **Local:** MinIO on port 9100
- **Production:** Vercel Blob (auto-detected via BLOB_READ_WRITE_TOKEN)
- **Important:** `allowOverwrite: true` required for re-ingest

### Project ID
Hardcoded as `proj_local` for development.

## Changelog

### v3.0.0 (2026-02-07)
- ✅ Design System Migration (Contently-style)
- ✅ Profile Analysis page (/analyze/[handle])
- ✅ Dual-layer navigation (ChatLayout + AppHeader)
- ✅ Modern UI components (ChatBubble, Avatar, etc.)
- ✅ Lavender gradient background
- ✅ AI sparkle avatar (not robot)
- ✅ Progressive loading animations

### v2.7.0 (2026-02-07)
- ✅ Product confirm visual feedback (green checkmark)
- ✅ Init step simplification (2 options only)
- ✅ Database: assets.external_id column
- ✅ Database: detected_products.analysis_id + source
- ✅ Storage: Vercel Blob allowOverwrite fix
- ✅ End-to-end pipeline verification

### v2.0.0 (2026-02-02)
- ✅ Async notifications system
- ✅ ChatChip component with icons
- ✅ Worker lock duration fix (60s)
- ✅ planGenerate column name fix

### v1.0.0
- Initial release
- Chat onboarding
- Instagram OAuth
- Vision analysis
- Content generation
- Calendar UI

## Documentation

- [FEATURES.md](docs/FEATURES.md) — Detailed feature documentation
- [ROADMAP.md](docs/ROADMAP.md) — Development roadmap
- [CONTEXT.md](CONTEXT.md) — AI development context

## License

MIT
