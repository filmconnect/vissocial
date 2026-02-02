# Vissocial

**AI-powered Instagram Content Management Platform**

Chat-first interface for Instagram content generation with Vision AI analysis, RL-based optimization, and automated publishing.

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, BullMQ workers
- **Database:** PostgreSQL
- **Storage:** MinIO (S3-compatible)
- **AI:** GPT-4 Vision, ChatGPT, fal.ai (Flux2)
- **Queue:** BullMQ + Redis

## Features

### ✅ Implemented

- **Chat-first UX** - Onboarding, commands, notifications all in chat
- **Instagram OAuth** - Connect professional/business accounts
- **Vision Analysis** - GPT-4 Vision analyzes Instagram posts
- **Product Detection** - Auto-detect products from images
- **Brand Profile** - Aggregated style analysis (colors, mood, patterns)
- **Content Generation** - AI generates topics, captions, visual directions
- **Image Rendering** - Flux2 via fal.ai creates preview images
- **Calendar/Editor** - View, edit, approve, schedule posts
- **Export** - CSV + ZIP bundle
- **RL Loop** - Thompson sampling policy for content optimization

### 🚧 In Progress

- Web scraping for public Instagram profiles
- Multi-platform support (TikTok, Facebook)
- Video generation (Luma/Runway)

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

# Redis (BullMQ)
REDIS_URL=redis://localhost:6380

# Storage (MinIO)
S3_ENDPOINT=http://localhost:9100
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=vissocial

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

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  /chat   │  │/calendar │  │/settings │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       │             │             │                    │
│  ┌────▼─────────────▼─────────────▼────┐              │
│  │           API Routes                 │              │
│  └────┬─────────────┬─────────────┬────┘              │
└───────┼─────────────┼─────────────┼────────────────────┘
        │             │             │
   ┌────▼────┐   ┌────▼────┐   ┌───▼────┐
   │PostgreSQL│   │  Redis  │   │ MinIO  │
   └────┬────┘   └────┬────┘   └────────┘
        │             │
        │        ┌────▼────────────────────┐
        │        │      BullMQ Workers     │
        │        │  ┌────────┐ ┌────────┐ │
        │        │  │ ingest │ │ render │ │
        │        │  └────────┘ └────────┘ │
        │        │  ┌────────┐ ┌────────┐ │
        └────────┤  │analyze │ │ brand  │ │
                 │  └────────┘ └────────┘ │
                 │  ┌────────┐ ┌────────┐ │
                 │  │  plan  │ │publish │ │
                 │  └────────┘ └────────┘ │
                 └────────────────────────┘
```

## Database Schema

### Core Tables
- `projects` - Multi-tenant projects
- `brand_profiles` - Aggregated brand analysis
- `assets` - Images/videos from Instagram
- `products` - Confirmed products

### Content Tables
- `content_packs` - Monthly content plans
- `content_items` - Individual posts
- `renders` - fal.ai render outputs

### Analysis Tables
- `instagram_analyses` - Vision API results
- `detected_products` - Auto-detected products
- `brand_rebuild_events` - Async rebuild tracking

### Chat Tables
- `chat_sessions` - User chat sessions
- `chat_messages` - Message history
- `chat_notifications` - Async worker notifications

### RL Tables
- `bandit_arms` - Thompson sampling arms
- `content_features` - Arm assignments
- `policy_snapshots` - Policy state history
- `post_metrics` - Performance metrics

## API Reference

### Chat
- `POST /api/chat/session` - Create session
- `GET /api/chat/session?session_id=X` - Load session
- `POST /api/chat/message` - Send message
- `GET /api/chat/notifications?session_id=X` - Poll notifications

### Instagram
- `GET /api/instagram/login` - Start OAuth
- `GET /api/instagram/callback` - OAuth callback

### Content
- `GET /api/content/latest` - Get latest content pack
- `GET /api/content/item?item_id=X` - Get single item
- `PATCH /api/content/item` - Update item

### Products
- `POST /api/products/confirm` - Confirm detected product
- `POST /api/products/reject` - Reject detected product

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
Instagram OAuth requires HTTPS. Use ngrok:
```bash
ngrok http 3000
# Update APP_URL in .env
```

### Vision API Timeout
In development, images are converted to base64 to bypass ngrok latency issues.

### Redis Port
Default is 6380 (not 6379) to avoid conflicts.

## Changelog

### v0.3.0 (2026-02-02)
- ✅ Async notifications system
- ✅ ChatChip component with proper icons
- ✅ Worker lock duration fix (60s)
- ✅ planGenerate column name fix

### v0.2.0
- ✅ Vision Analysis Module
- ✅ Product detection
- ✅ Brand profile aggregation
- ✅ Base64 encoding for dev

### v0.1.0
- Initial release
- Chat onboarding
- Instagram OAuth
- Content generation
- Calendar UI

## License

MIT
