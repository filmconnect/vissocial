# Features (Implemented)

> **Zadnje ažuriranje:** 7. veljače 2026 — V3 Design System + V7 Fixes

## Landing & Profile Analysis (V3 — NOVO)

### Landing Page
- Contently-style dizajn s lavender gradientom
- Input: @handle, instagram.com/url, ili ime firme
- "Analyze profile" → redirect na /analyze/[handle]
- "See an example" → /analyze/nike

### Profile Analysis (/analyze/[handle])
- Dvofazna analiza: Instagram scrape + GPT-4o-mini brand analysis
- Prikazuje: Company, Services, Brand Tone, Target Audience, Language
- USP Analysis (2-3 paragrafa)
- Recommended Focus za idućih 30 dana
- Progressive reveal animacije (staggered fade-in)
- Error handling: timeout, network, not_found, generic
- "Sounds good → Continue" → /chat?from=analyze

## Chat-first UX

### Onboarding Flow
- Finite-state chat: goal → planned posts → profile type → focus → horizon
- **Init opcije (V7):** samo 2 — "Spoji Instagram" + "Nastavi bez Instagrama"
- Clickable chips za brze odgovore
- Podržava string chips (legacy) i ChatChipData objekte

### Chat Commands
- `generiraj plan` / `generate` → Queue content plan generation
- `poveži instagram` → Redirect na OAuth
- `export` → Generate CSV + ZIP bundle
- `prikaži proizvode` → Display detected products za potvrdu

### Async Notifications
- Worker procesi šalju notifikacije u chat
- Frontend polling svakih 5 sekundi
- Notifikacije uključuju actionable chips
- Auto-marked as read kad se prikažu

### Product Confirmation (V7 — poboljšano)
- Chipovi za potvrdu proizvoda: ☐ Product Name
- Klik → API poziv → vizualni feedback
- **Prije:** ☐ bijeli chip
- **Poslije:** ✅ zeleni chip s kvačicom
- Potvrđeni proizvodi idu u `products` tablicu

## Navigation (V3 — NOVO)

### Dvoslojna arhitektura
- **ChatLayout.tsx** — za /chat i /analyze stranice
  - Vissocial logo + nav linkovi + step indicator
  - "Nova sesija" button
- **AppHeader.tsx** — za /settings, /profile, /calendar
  - Vissocial logo + nav linkovi
  - Uvjetno renderiranje (null na "/" i "/chat")

### NAV_ITEMS
- Chat, Calendar, Profile, Settings
- Active state detekcija putem usePathname()

## Instagram Integration

### OAuth Flow
1. User klikne "Connect Instagram" u Settings
2. Redirect na Meta OAuth
3. Exchange code za access token
4. Discover connected professional account via Page
5. Store long-lived token (59 days)

### Media Ingest
- Fetches zadnjih 25 media items
- Downloads slike u MinIO/Vercel Blob storage
- **V7 fix:** `allowOverwrite: true` za re-ingest
- **V7 fix:** `external_id` kolona za duplicate detection
- Queue Vision analysis za svaku sliku

### Publishing
- Toggle: `ENABLE_INSTAGRAM_PUBLISH` + per-project `ig_publish_enabled`
- Uses Media Container API
- Supports scheduled publishing via `schedule.tick`

## Vision Analysis

### GPT-4 Vision Integration
- Analizira svaku Instagram sliku
- Ekstrahira: visual style, products, brand elements, quality
- Stores raw JSON za fleksibilnost

### Product Detection
- Auto-detektira proizvode iz slika
- **V7 fix:** `analysis_id` i `source` kolone
- Stores u `detected_products` tablicu
- User confirms/rejects via chat chips
- Confirmed products idu u `products` tablicu

### Brand Profile Aggregation
- Agregira sve analize u brand profile
- Kalkulira: dominant colors, photography style, mood
- Prati caption patterns i consistency scores
- Event-driven rebuild on analysis completion

## Content Generation

### Plan Generation
- ChatGPT za topic/caption/visual direction
- Thompson sampling odabire content format
- Supports multiple formats: feed, reel, carousel, story

### Visual Rendering
- Flux2 via fal.ai generira preview slike
- Prompt uključuje scene description + on-screen text
- Negative prompts za quality control

### Multi-reference Support
- Upload reference images labeled:
  - `style_reference` — Visual style
  - `product_reference` — Product shots
  - `character_reference` — People/mascots
- Do 8 referenci korišteno u generiranju

## Calendar/Editor

### Monthly View
- Grid content items po danu
- Thumbnail previews kad je renderirano
- Status badges (draft, approved, scheduled, published)

### Item Editor
- Edit caption (short/long)
- Set publish mode (export only, schedule, auto-publish)
- Set scheduled time
- Approve/unapprove
- Regenerate s custom instruction
- Publish now (manual)

## Export

### Bundle Contents
- CSV sa svim item metadatama
- ZIP containing:
  - Individual caption.txt files
  - Rendered images (kad dostupne)

## Design System (V3 — NOVO)

### Komponente (src/ui/)
- **ChatBubble.tsx** — Chat poruke, chipovi, AI/User avatari
- **ChatLayout.tsx** — Layout za chat stranice s headerom
- **AppHeader.tsx** — Navigacija za ostale stranice
- **Button.tsx** — Primary, secondary, ghost, link varijante
- **Card.tsx** — Card wrapper s varijantama
- **Chip.tsx** — Standalone chip komponenta
- **Avatar.tsx** — AI (sparkle) i User (inicijali) avatari
- **Icons.tsx** — SVG ikone library
- **Input.tsx** — Input s label/error

### Design Tokens
- Primary: žuta (#FFCA28)
- Secondary: lavender (#F8F7FF)
- AI Avatar: sparkle/star gradient (NE robot)
- Shadows: card, chat, button

### Tailwind Extensions
- `.bg-gradient-lavender`
- `.shadow-chat`
- `.btn-primary`
- Custom boje: primary-50 do primary-700, lavender-50 do lavender-200

## Background Workers

### Queue Configuration
- `lockDuration: 60000` (60s) sprječava lock expiration
- `stalledInterval: 30000` detektira stuck jobs
- `concurrency` varira po queue tipu

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

## Storage (V7 — ažurirano)

### Hybrid System
- **Vercel Blob** (production): kad postoji BLOB_READ_WRITE_TOKEN
- **MinIO/S3** (local dev): S3Client na portu 9100

### Ključne funkcije
- `allowOverwrite: true` — obavezno za re-ingest
- `makePublicUrl()` — interno → HTTPS proxy za Vision API
- `validateVisionUrl()` — provjera URL-a za OpenAI
