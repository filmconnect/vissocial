# VISSOCIAL - KOMPLETNI KONTEKST I ZNANJE O PROJEKTU

> **NAPOMENA:** Ovaj dokument služi kao autoritativni izvor znanja o Vissocial projektu. U slučaju proturječja s project knowledge ili drugim izvorima, **ovaj dokument ima prioritet**.
> 
> **Verzija:** 5.1 (Ažurirano: 25. veljače 2026)
> **Branch:** `main` (production deployment)
> **GitHub:** Projekt je spojen s GitHub repozitorijem - kod se redovito sync-a

---

## 1. PREGLED PROJEKTA

**Vissocial** je AI-powered Instagram content management platforma s chat-first sučeljem. Korisnik kroz razgovor s AI asistentom prolazi onboarding, analizira svoj brand, potvrđuje proizvode i generira sadržaj za Instagram.

### 1.1 Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS → **Vercel** (production)
- **Backend:** Next.js API Routes + BullMQ background worker → **Railway** (production)
- **Database:** PostgreSQL → **Neon** (production, zahtijeva SSL)
- **Storage:** MinIO (S3-compatible, port **9100** local) / **Vercel Blob** (production)
- **Queue:** BullMQ + Redis → **Railway Redis** (production), port **6380** lokalno
- **AI:** 
  - GPT-4 Vision za analizu slika
  - GPT-4o-mini za brand analizu (/api/analyze)
  - ChatGPT za generiranje sadržaja
  - fal.ai (Flux2) za generiranje slika — **max 4 image_urls po requestu**, **safety checker disabled**
- **Project ID:** Dinamički, cookie-based (`vissocial_pid`) — **NE hardkodirani `proj_local`!**

### 1.2 Production Infrastruktura

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

### 1.3 Lokacija koda
```
C:\Users\Velo\source\vissocial_chat\vissocial_app\
```

### 1.4 Design System (V3 — Contently stil)
- **Boje:** Primary (žuta #FFCA28), Secondary (lavender #F8F7FF)
- **Font:** Inter (Google Fonts)
- **Avatar:** Sparkle/star gradient (NE robot)
- **Komponente:** `src/ui/` — ChatBubble, ChatLayout, AppHeader, Button, Card, Chip, Avatar, Icons, Input
- **Dodatne UI komponente:** ColorPicker, MultiSelect, ProgressBar, ProductCard

---

## 2. GLAVNI FLOW APLIKACIJE

### 2.1 User Journey — Kompletni Flow Dijagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    LANDING PAGE (/)                               │
│  Korisnik unosi @handle → "Analyze profile"                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 1: PROFILE ANALYSIS (/analyze/[handle])        │
│  GPT-4o-mini → Company, Services, Tone, Audience, USP           │
│  [Sounds good → Continue]  [This doesn't feel right]             │
│  Stored in localStorage → passed to /chat via ?from=analyze      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 2: INIT (/chat)                                │
│  🍪 Cookie "vissocial_pid" → getProjectId() → novi projekt      │
│  "Kako želiš započeti?"                                          │
│  [Spoji Instagram →]  [Nastavi bez Instagrama]                   │
└──────────┬──────────────────────────────────────┬───────────────┘
           │                                      │
           ▼                                      ▼
┌─────────────────────┐                ┌─────────────────────────┐
│  INSTAGRAM OAUTH    │                │  BEZ INSTAGRAMA         │
│  /settings → login  │                │  no_instagram_options:  │
│  project_id u state │                │  → upload_reference     │
│  Meta OAuth flow    │                │  → website_input        │
│  ⚠️ Mora biti       │                │  → scrape_input         │
│  Professional/      │                └────────────┬────────────┘
│  Creator account!   │                             │
└──────────┬──────────┘                             │
           │                                        │
           ▼                                        │
┌─────────────────────────────────────┐             │
│  WORKER PIPELINE (Railway)          │             │
│                                     │             │
│  1. instagramIngest                 │             │
│     → Fetch media (Graph API)       │             │
│     → Upload → Vercel Blob          │             │
│                                     │             │
│  2. analyzeInstagram (×3 parallel)  │             │
│     → GPT-4 Vision na svaku sliku   │             │
│     → detected_products             │             │
│                                     │             │
│  3. brandRebuild                    │             │
│     → Agregira sve analize          │             │
│     → UPDATE brand_profiles         │             │
│     → chat_notification 📬          │             │
└──────────┬──────────────────────────┘             │
           │                                        │
           ▼                                        │
┌─────────────────────────────────────┐             │
│  STEP 4: PRODUCT CONFIRMATION       │             │
│  Notifikacija u chatu s chipovima   │             │
│  [✅ Potvrdi] [❌ Odbaci]            │             │
│  → Zelena kvačica nakon potvrde     │             │
└──────────┬──────────────────────────┘             │
           │                                        │
           ▼                                        │
┌─────────────────────────────────────────────────────────────────┐
│              STEP 3: ONBOARDING                                  │
│  Goal → Frequency → Tone → Promo level                          │
│  [Balanced growth] [3x per week] [Friendly] [Balanced 20-30%]   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 5: CONTENT GENERATION                          │
│  [Generate my plan] → LLM (Thompson sampling)                   │
│  → fal.ai Flux2 render (max 4 refs, safety checker OFF)         │
│  DEV_GENERATE_LIMIT=3 (prod)                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 6: CALENDAR (/calendar)                        │
│  Grid s thumbnailima, caption, format badge                      │
│  Polls /api/content/latest svake 4s                              │
└─────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════
  "Nova sesija" gumb → POST /api/chat/reset
  → Novi projekt + novi cookie → Čist početak
  → Stari projekt ostaje u bazi (orphaned)
═══════════════════════════════════════════════════════════════════
```

### 2.2 FSM States

| Step | Opis | Sljedeći koraci |
|------|------|-----------------|
| `init` | Početni ekran | spoji IG, nastavi bez |
| `scrape_input` | Unos IG usernamea | scrape_complete |
| `scrape_complete` | Rezultati scrapinga | onboarding |
| `no_instagram_options` | Opcije bez IG | web stranica, upload |
| `website_input` | Unos URL-a | onboarding |
| `upload_reference` | Odabir tipa uploada | upload_style/product/character |
| `upload_style_reference` | Upload stil slika | upload_reference, onboarding |
| `upload_product_reference` | Upload proizvoda | upload_reference, onboarding |
| `upload_character_reference` | Upload likova | upload_reference, onboarding |
| `onboarding` | Onboarding pitanja | ready_to_generate |
| `ready_to_generate` | Potvrda generiranja | generating |
| `generating` | U tijeku | calendar |

### 2.3 Init Chips (V9 — navigation tip)

```typescript
// src/app/api/chat/session/route.ts
chips: [
  { type: "navigation", label: "Spoji Instagram", href: "/settings" },
  { type: "onboarding_option", label: "Nastavi bez Instagrama", value: "nastavi bez" }
]
```

### 2.4 Generiranje — uvjeti

```typescript
// Može generirati kad:
const canGenerate = 
  (has_reference_image || has_confirmed_products) && 
  has_goal && has_profile_type && has_focus;
```

---

## 3. MULTI-USER SUSTAV (V9 — Dynamic Project ID)

### 3.1 Pregled

V9 uvodi cookie-based project isolation. Svaki korisnik automatski dobiva svoj projekt — nema auth sustava, ali svaki browser/session ima vlastiti `project_id`.

### 3.2 Core modul: `src/lib/projectId.ts`

```typescript
// getProjectId() — čita cookie "vissocial_pid", kreira projekt ako ne postoji
// readProjectId() — read-only za OAuth state param
// setProjectIdCookie() — postavlja httpOnly cookie (30 dana)
// ensureProject() — verificira da projekt i brand_profile postoje
```

### 3.3 Kako radi

```
1. Korisnik otvori /chat
   → getProjectId() čita cookie "vissocial_pid"
   → Ako nema → kreira novi projekt (proj_XXXXXXXXXXXX) + cookie
   → Ako ima → verificira da projekt postoji u bazi

2. Instagram OAuth
   → login route: project_id ide u OAuth state parametar
   → callback route: čita project_id iz state, sprema token na taj projekt
   → Detektira promjenu IG accounta (čisti stare podatke ako različit ig_user_id)

3. "Nova sesija" gumb
   → POST /api/chat/reset
   → Kreira NOVI projekt s novim ID-om
   → Postavlja novi cookie (prepisuje stari)
   → Stari projekt ostaje u bazi ali je orphaned
```

### 3.4 Migrirani fajlovi (19 ruta)

Sve API rute koriste `getProjectId()` umjesto hardkodiranog `proj_local`:
- `src/app/api/chat/session|message|notifications|notify|reset/route.ts`
- `src/app/api/instagram/login|callback/route.ts`
- `src/app/api/projects/me/route.ts`
- `src/app/api/content/latest/route.ts`
- `src/app/api/export/route.ts`
- `src/app/api/products/pending|route.ts`
- `src/app/api/profile/rebuild|route.ts`
- `src/app/api/scrape/website/route.ts`
- `src/app/api/analyze/status|trigger/route.ts`
- `src/app/api/assets/presign|references|upload/route.ts`

### 3.5 Worker konfiguracija (V9)

```typescript
// src/server/worker.ts
import 'dotenv/config';  // Potrebno za lokalni dev (next dev auto-loadira .env)
const PORT = process.env.PORT || 3001;  // 3001 lokalno, Railway postavlja PORT
```

---

## 4. NAVIGACIJA I RUTE

| Ruta | Header | Izvor |
|------|--------|-------|
| `/` | Landing header (Pricing, Log in, Sign up) | page.tsx inline |
| `/chat` | ChatLayout header (nav + step indicator) | ChatLayout.tsx |
| `/analyze/[handle]` | ChatLayout header | ChatLayout.tsx |
| `/settings`, `/profile`, `/calendar` | AppHeader (nav linkovi) | AppHeader.tsx via layout.tsx |

NAV_ITEMS: Chat, Calendar, Profile, Settings

---

## 5. CHAT TIPOVI I KOMPONENTE

### 5.1 ChatChipData tipovi

```typescript
interface ChatChipData {
  type: "suggestion" | "onboarding_option" | "product_confirm" | 
        "navigation" | "action" | "file_upload" | "asset_delete";
  label: string;
  value?: string;
  recommended?: boolean;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
  confirmed?: boolean;        // V7: za zelenu kvačicu
  assetId?: string;
  uploadType?: string;
  accept?: string;
}
```

### 5.2 Reference Image tipovi

| Tip | Label u DB | Svrha | Max |
|-----|-----------|-------|-----|
| **Style Reference** | `style_reference` | Vizualni stil, mood, kompozicija | 5 |
| **Product Reference** | `product_reference` | Slike proizvoda za AI | 5 |
| **Character Reference** | `character_reference` | Osobe/maskote za konzistentnost | 5 |

**Ukupni max pri generiranju:** 8 slika. `prioritizeRefs()`: 1 product → 1 style → 1 character → fill.

---

## 6. DATABASE SCHEMA (V9 — Multi-project)

### 6.1 Projects

```sql
projects (
  id TEXT PRIMARY KEY,          -- V9: dinamički "proj_XXXXXXXXXXXX"
  name TEXT,
  meta_access_token TEXT,       -- Instagram OAuth token
  meta_token_expires_at TIMESTAMPTZ,
  ig_user_id TEXT,
  ig_connected BOOLEAN DEFAULT false,
  ig_publish_enabled BOOLEAN DEFAULT false,
  fb_page_id TEXT,
  plan_month TEXT,
  plan_type TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**VAŽNO:** Kolone `ig_token`, `meta_user_id`, `ig_username` NE POSTOJE!
Koristi: `meta_access_token`, `ig_user_id`, `ig_connected`

### 6.2 Assets

```sql
assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  type TEXT,                   -- 'image', 'video'
  source TEXT,                 -- 'instagram', 'upload'
  url TEXT,                    -- MORA biti Vercel Blob URL u produkciji!
  label TEXT,                  -- 'style_reference', 'product_reference', 'character_reference', NULL
  metadata JSONB,
  external_id TEXT,            -- IG media ID za duplicate detection
  created_at TIMESTAMPTZ
)
-- V9: Unique constraint je per-project (NE globalni!)
-- UNIQUE INDEX idx_assets_project_external_id ON assets(project_id, external_id) WHERE external_id IS NOT NULL
```

### 6.3 Chat

```sql
chat_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  state JSONB                    -- { step, goal, profile_type, focus, ... }
)

chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  role TEXT,                     -- 'user', 'assistant'
  text TEXT,
  meta JSONB                     -- { chips: [...] }
)

chat_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  project_id TEXT,
  type TEXT, title TEXT, message TEXT,
  data JSONB, chips JSONB, payload JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)
```

### 6.4 Products & Analyses

```sql
detected_products (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  asset_id TEXT,
  analysis_id TEXT,
  product_name TEXT,
  category TEXT,
  visual_features JSONB,
  prominence TEXT,
  confidence NUMERIC,
  frequency INTEGER DEFAULT 1,
  source TEXT DEFAULT 'instagram',
  status TEXT CHECK (status IN ('pending', 'confirmed', 'rejected')),
  locked BOOLEAN DEFAULT false,      -- locked = brandRebuild ga NE modificira
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  UNIQUE(asset_id, product_name)
)

instagram_analyses (
  id TEXT PRIMARY KEY,
  asset_id TEXT,
  project_id TEXT,
  analysis JSONB,
  model_version TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

brand_profiles (
  project_id TEXT PRIMARY KEY,
  language TEXT DEFAULT 'hr',
  profile JSONB                  -- BrandProfile objekt (visual_style, caption_patterns, content_themes, _metadata)
)
```

### 6.5 Content & RL

```sql
bandit_arms (
  id TEXT PRIMARY KEY,           -- VAŽNO: NE arm_id!
  name TEXT,
  params JSONB                   -- VAŽNO: NE arm_params!
)

content_packs (id, project_id, month, created_at)
content_items (id, content_pack_id, project_id, day, format, topic, visual_brief, caption, status)
content_features (id, content_item_id, arm_id)
renders (id, content_item_id, status, outputs JSONB)
```

### 6.6 Migration Tracking (V9)

```sql
_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Pokretanje:** `npm run migrate` (koristi `src/lib/sql.ts`)
- Kreira `_migrations` tablicu ako ne postoji
- Preskače već primijenjene migracije
- Produkcija: Neon SQL Editor ili `$env:DATABASE_URL="neon_url"; npm run migrate`

---

## 7. STORAGE SUSTAV (V4 — Produkcijski fix)

### 7.1 Hybrid Storage

```typescript
// src/lib/storage.ts
// Auto-detection putem BLOB_READ_WRITE_TOKEN env varijable:
// - Vercel Blob (production): BLOB_READ_WRITE_TOKEN postoji
// - MinIO/S3 (local dev): S3Client na portu 9100
```

### 7.2 KRITIČNI BUG FIX: instagramIngest URL

```typescript
// src/server/processors/instagramIngest.ts
// PRIJE (BUG): makePublicUrl(s3Key) → proxy URL koji ne radi u produkciji
// POSLIJE (FIX): makePublicUrl(uploadedUrl) → koristi Vercel Blob URL direktno

const uploadedUrl = await putObject(s3Key, buffer, contentType);
const publicUrl = makePublicUrl(uploadedUrl);  // ← MORA biti uploadedUrl, NE s3Key!
```

### 7.3 makePublicUrl logika

```
Input                              → Output
Vercel Blob URL (https://...blob)  → passthrough (as-is)
https:// URL                       → passthrough
MinIO relative path                → APP_URL/vissocial/{path}
```

---

## 8. INSTAGRAM → ANALIZA → NOTIFIKACIJA PIPELINE

### 8.1 OAuth Flow (V9)

```
[Settings] ──► "Connect Instagram" ──► /api/instagram/login
                                            │
                                            ├──► project_id u OAuth state param (V9)
                                            ▼
                                    Meta OAuth Dialog
                                    ⚠️ Mora biti Professional/Creator account!
                                            │
                                            ▼
                                    /api/instagram/callback
                                            │
                                            ├──► Čita project_id iz state (V9)
                                            ├──► Exchange code → long-lived token (59 dana)
                                            ├──► Find IG Business Account via Page
                                            ├──► Detektira promjenu IG accounta (V9)
                                            ├──► Update projects table
                                            ├──► Queue instagram.ingest job
                                            ▼
                                    Redirect to /chat?ig_connected=1
```

### 8.2 Worker Pipeline

```
1. instagramIngest (q_ingest)
   → Fetch media putem Graph API
   → Upload slike u Vercel Blob (allowOverwrite!)
   → INSERT assets s external_id i Vercel Blob URL
   → Queue: q_analyze za svaki asset

2. analyzeInstagram (q_analyze, concurrency: 3)
   → GPT-4 Vision analiza (koristi Vercel Blob URL)
   → INSERT instagram_analyses
   → INSERT detected_products (analysis_id, source)

3. brandRebuild (q_brand_rebuild)
   → Agregira visual_style, content_themes, caption_patterns
   → UPDATE brand_profiles (ali NE locked products!)
   → notify.analysisComplete() → chat_notifications

4. Frontend polling (5s)
   → GET /api/chat/notifications
   → Prikaže product_confirm chipove
   → Klik → POST /api/products/confirm → zelena kvačica
```

### 8.3 Notifikacije

```typescript
import { notify } from "@/lib/notifications";
await notify.analysisComplete(project_id, { posts_analyzed, products_found, dominant_color });
await notify.planGenerated(project_id, itemCount, month);
await notify.jobFailed(project_id, jobName, error);
```

---

## 9. WORKER ARHITEKTURA

### 9.1 Queues

| Queue | Job | Concurrency | Lock Duration |
|-------|-----|-------------|---------------|
| `q_ingest` | `instagram.ingest` | 1 | 60s |
| `q_analyze` | `analyze.instagram` | 3 | 90s |
| `q_brand_rebuild` | `brand.rebuild` | 1 | 60s |
| `q_llm` | `plan.generate` | 1 | 120s |
| `q_render` | `render.flux` | 3 | **180s** |
| `q_export` | `export.pack` | 1 | 60s |
| `q_publish` | `schedule.tick` / `publish.instagram` | 3 | 60s |
| `q_metrics` | `metrics.ingest` | 1 | 60s |

### 9.2 Worker Config

```typescript
import 'dotenv/config';  // V9: za lokalni dev

const baseWorkerConfig = {
  connection: { url: config.redisUrl },
  lockDuration: 60000,
  stalledInterval: 30000,
  maxStalledCount: 2
};
```

- Single Node.js process, sve workere u jednom procesu
- Port 3001 lokalno (izbjegava konflikt s Next.js na 3000)
- Railway sets PORT automatically
- Redis connection monitoring via ioredis, auto-reconnect on ECONNRESET

---

## 10. HANDLER REDOSLIJED U MESSAGE ROUTE

**KRITIČNO:** Redoslijed handlera u `src/app/api/chat/message/route.ts` je bitan!

```typescript
// 1. GLOBALNI HANDLERI (hvataju iz bilo kojeg stepa)
if (norm.includes("spojen") && norm.includes("instagram")) { ... }
if (norm.startsWith("cilj:")) { ... }
if (norm.startsWith("profil:")) { ... }
if (norm.startsWith("fokus:")) { ... }

// 2. GLOBALNE KOMANDE
if (norm.includes("prikaži") && norm.includes("proizvod")) { ... }
if (norm.includes("potvrdi sve")) { ... }
if (norm.includes("generiraj")) { ... }
if (norm.includes("pove") && norm.includes("insta")) { ... }
if (norm.includes("web") && norm.includes("stranic")) { ... }

// 3. SPECIFIČNI UPLOAD HANDLERI (PRIJE općeg!)
if (norm.includes("upload stil") || ...) { ... }
if (norm.includes("upload proizvod") || ...) { ... }
if (norm.includes("upload lik") || ...) { ... }
if (norm.includes("preskoči")) { ... }

// 4. OPĆI UPLOAD HANDLER (NAKON specifičnih!)
if (norm.includes("uploaj") || (norm.includes("upload") && !specifični)) { ... }

// 5. STEP-SPECIFIČNI HANDLERI
if (step === "init") { ... }
if (step === "no_instagram_options") { ... }
// ... itd.

// 6. DEFAULT
```

---

## 11. PRODUCTION DEPLOYMENT

### 11.1 Infrastruktura

| Service | Platform | Napomena |
|---------|----------|----------|
| Frontend (Next.js) | Vercel | Auto-deploy iz GitHub main |
| Worker (BullMQ) | Railway | Auto-deploy iz GitHub main |
| Database | Neon | PostgreSQL, zahtijeva SSL |
| Redis | Railway | BullMQ queue backend |
| Storage | Vercel Blob | Slike, renderovi |
| Image Gen | fal.ai | Flux2, max 4 image_urls, safety checker OFF |

### 11.2 Environment Variables

**Vercel (Frontend):**
```env
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=Vissocial
APP_URL=https://vissocial.vercel.app
META_REDIRECT_URI=https://vissocial.vercel.app/api/instagram/callback
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
REDIS_URL=redis://default:...@switchyard.proxy.rlwy.net:54046
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
FAL_KEY=...
FAL_FLUX_MODEL=flux/dev
FAL_FLUX_EDIT_MODEL=flux-2/edit
BLOB_READ_WRITE_TOKEN=vercel_blob_...
META_APP_ID=...
META_APP_SECRET=...
FREE_WATERMARK_TEXT=Made with Vissocial
FREE_CAPTION_FOOTER=-\nMade with @vissocial\n
```

**Railway (Worker):**
```env
APP_URL=https://vissocial.vercel.app
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
REDIS_URL=redis://default:...@switchyard.proxy.rlwy.net:54046
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
FAL_KEY=...
FAL_FLUX_MODEL=flux/dev
FAL_FLUX_EDIT_MODEL=flux-2/edit
BLOB_READ_WRITE_TOKEN=vercel_blob_...
META_APP_ID=...
META_APP_SECRET=...
NODE_ENV=production
DEV_GENERATE_LIMIT=3
```

**Lokalni Development (.env):**
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
META_APP_ID=...
META_APP_SECRET=...
APP_URL=https://your-ngrok-url.ngrok-free.dev
DEV_GENERATE_LIMIT=3
```

**KRITIČNO:**
- `BLOB_READ_WRITE_TOKEN` mora biti na OBJE platforme (Vercel + Railway)
- `APP_URL` mora biti BEZ trailing slasha i BEZ newline/razmaka
- `DATABASE_URL` mora imati `?sslmode=require` na obje platforme
- `META_APP_ID` i `META_APP_SECRET` moraju biti postavljeni na Railway (ne "replace_me"!)
- Credentials referenca: `C:\Users\Velo\source\vissocial_chat\.credentials\vissocial-credentials.md`

### 11.3 SSL za Neon (db.ts)

```typescript
const isNeon = config.dbUrl?.includes("neon.tech");
const sslConfig = IS_PRODUCTION || isNeon ? { rejectUnauthorized: false } : false;
export const pool = new Pool({ connectionString: config.dbUrl, ssl: sslConfig });
```

### 11.4 Vercel API Routes — force-dynamic

```typescript
// OBAVEZNO na svim API routama koje čitaju iz baze:
export const dynamic = "force-dynamic";
```

Bez toga Vercel kešira response na build-u i nikad ne osvježi podatke.

### 11.5 fal.ai Konfiguracija

```typescript
const FAL_MAX_IMAGE_URLS = 4;
enable_safety_checker: false    // V9: isključen jer blokira product slike
// prioritizeRefs(): 1 product → 1 style → 1 character → fill remaining
```

### 11.6 Debug Endpoints

```
GET  /api/debug/pipeline-status    — Pregled svih queue-ova, failed jobova, recentnih itema
POST /api/debug/clean-failed       — Očisti failed jobove iz Redis queue-ova
POST /api/debug/clean-old-packs    — Briše stare content packove
GET  /health                       — Health check
```

---

## 12. TESTIRANJE — FULL RESET PROCEDURA

**1. Neon SQL Editor:**
```sql
TRUNCATE 
  renders, content_features, content_items, content_packs,
  chat_notifications, chat_messages, chat_sessions,
  detected_products, instagram_analyses, brand_rebuild_events,
  brand_profiles, assets, user_actions
CASCADE;


**2. Očisti Redis:**
```powershell
Invoke-RestMethod -Method POST -Uri "https://vissocial.vercel.app/api/debug/clean-failed"
```

**3. Incognito prozor** → `https://vissocial.vercel.app` (novi cookie → novi projekt)

**4. Provjeri pipeline:**
```powershell
Invoke-RestMethod -Uri "https://vissocial.vercel.app/api/debug/pipeline-status" | ConvertTo-Json -Depth 10
```

**5. Provjeri URL-ove u bazi:**
```sql
SELECT id, LEFT(url, 80) FROM assets LIMIT 3;
-- MORA biti: https://tdtglu5leenek1zg.public.blob.vercel-storage.com/...
-- NE: https://vissocial.vercel.app/vissocial/...
```

---

## 13. API ENDPOINTS — KOMPLETNA LISTA

### Chat
```
POST /api/chat/session          - Nova sesija (koristi getProjectId())
GET  /api/chat/session          - Učitaj sesiju
POST /api/chat/message          - Pošalji poruku (FSM)
GET  /api/chat/notifications    - Poll notifikacije (5s)
POST /api/chat/notifications    - Označi pročitano
POST /api/chat/reset            - "Nova sesija" — novi projekt + cookie
```

### Instagram
```
GET  /api/instagram/login       - OAuth start (project_id u state)
GET  /api/instagram/callback    - OAuth callback (čita project_id iz state)
POST /api/instagram/scrape      - Web scraping profila
```

### Profile
```
GET   /api/profile              - Brand profil + metadata + products + references
PATCH /api/profile              - Ažuriraj brand profil
POST  /api/profile/rebuild      - Pokreni rebuild worker job
```

### Products
```
GET    /api/products            - Lista proizvoda
GET    /api/products/pending    - Pending proizvodi
POST   /api/products/confirm    - Potvrdi proizvod
POST   /api/products/reject     - Odbaci proizvod
PATCH  /api/products/[id]       - Update (name, category, locked)
DELETE /api/products/[id]       - Obriši proizvod
```

### Assets
```
POST   /api/assets/upload       - Upload (FormData: file + label)
GET    /api/assets/references   - Dohvati reference images po tipu
POST   /api/assets/presign      - Presigned URL
DELETE /api/assets/[id]         - Obriši asset
```

### Content
```
GET   /api/content/latest       - Najnoviji content pack (force-dynamic!)
GET   /api/content/item         - Pojedini item
PATCH /api/content/item         - Update item
POST  /api/content/regenerate   - Regeneriraj
```

### Analyze
```
POST /api/analyze               - Dvofazna analiza (scrape + GPT-4o-mini)
GET  /api/analyze/status        - Status analize
POST /api/analyze/trigger       - Trigger analize
```

### Ostalo
```
POST /api/scrape/website        - Web scraping URL-a
POST /api/export                - ZIP export (CSV + media)
GET  /api/projects/me           - Trenutni projekt info
```

---

## 14. POZNATI BUGOVI I FIXES (POVIJEST)

### V9 — Multi-User & Dynamic Project ID (25. veljače 2026)
- ✅ Cookie-based project isolation (`vissocial_pid`), 19 API ruta migrirano
- ✅ Instagram reconnect detection, OAuth state param s project_id
- ✅ Migration tracking (`_migrations` tablica), Assets unique index per-project
- ✅ Worker: `import 'dotenv/config'`, PORT 3001, fal.ai safety checker OFF, scheduleTick return type

### V8 — Production Deployment (24. veljače 2026)
- ✅ SSL za Neon, fal.ai limit (max 4), Vercel caching (force-dynamic)
- ✅ Storage URL bug (`makePublicUrl(uploadedUrl)` umjesto `s3Key`)
- ✅ APP_URL trailing slash, BLOB_READ_WRITE_TOKEN na Railway
- ✅ Missing DB columns, Redis monitoring, BullMQ lock 180s, Health check

### V7 — Database & Storage
- ✅ `assets.external_id`, `detected_products.analysis_id` + `source` kolone
- ✅ `allowOverwrite: true` za Vercel Blob, product confirm zelena kvačica

### V3 — Design System
- ✅ ChatBubble/ChatLayout komponente, dvoslojna navigacija, Profile Analysis

### V1-V6 — Sažetak ranije fixanih bugova
- ✅ `bandit_arms.id` (ne arm_id), `meta_access_token` (ne ig_access_token)
- ✅ BullMQ lock duration, notification sustav, duplicate messages
- ✅ OAuth redirect loop, upload handler redoslijed, web scraping
- ✅ Profile page null safety, progress tracking, generation requirements

---

## 15. CHECKLIST ZA DEVELOPMENT

Prije svakog odgovora:

- [ ] Koristi `project_knowledge_search` za provjeru koda
- [ ] Provjeri odgovara li database schema (TOČNA IMENA KOLONA!)
- [ ] Generiraj KOMPLETNE datoteke, ne snippete
- [ ] Provjeri koristi li se URL (ne base64) za Vision API
- [ ] Redis port = **6380** (lokalno)
- [ ] Project ID = **dinamički via `getProjectId()`** (NE hardkodirani "proj_local"!)
- [ ] Token kolona = **meta_access_token** (NE ig_token!)
- [ ] IG user kolona = **ig_user_id** (NE meta_user_id!)
- [ ] IG connected kolona = **ig_connected** (boolean)
- [ ] Bandit arms: kolona `id` i `params` (NE `arm_id` / `arm_params`!)
- [ ] Storage: **allowOverwrite: true** za Vercel Blob
- [ ] Storage: koristi **uploadedUrl** (NE s3Key) za makePublicUrl u produkciji
- [ ] API routes: dodaj `export const dynamic = "force-dynamic"` za DB queries
- [ ] fal.ai: max **4 image_urls** po requestu, **safety checker OFF**
- [ ] APP_URL: **BEZ trailing slasha**
- [ ] Nove API rute: koristi `import { getProjectId } from "@/lib/projectId"`
- [ ] Instagram zahtijeva **Professional/Creator** account (ne Personal)
- [ ] Handler redoslijed u message route: specifični PRIJE općih

---

## 16. BUDUĆE FAZE (TODO)

### Kratkoročno
- [ ] DEV_GENERATE_LIMIT enforcement
- [ ] Error handling na /analyze stranici
- [ ] Credential rotation
- [ ] File upload drag & drop u chat UI
- [ ] Toast notifikacije za upload

### Srednjoročno
- [ ] Multi-image upload
- [ ] Image crop/resize prije uploada
- [ ] Reference image reordering
- [ ] Production monitoring (alerts za failed jobs)
- [ ] Rate limiting na API endpoints

### Dugoročno
- [ ] Shopify integration
- [ ] Automatic scheduling
- [ ] A/B testing za content
- [ ] Proper auth sustav (zamjena za cookie-based)

---

**KRAJ DOKUMENTA**

*Ovaj dokument je autoritativan izvor znanja o Vissocial projektu.*
*Zadnje ažuriranje: 25. veljače 2026 — V9 Multi-User & Dynamic Project ID*
