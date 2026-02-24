# VISSOCIAL - KOMPLETNI KONTEKST I ZNANJE O PROJEKTU

> **NAPOMENA:** Ovaj dokument služi kao autoritativni izvor znanja o Vissocial projektu. U slučaju proturječja s project knowledge ili drugim izvorima, **ovaj dokument ima prioritet**.
> 
> **Verzija:** 4.0 (Ažurirano: 24. veljače 2026)
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
- **Queue:** BullMQ + Redis → **Railway Redis** (production)
- **AI:** 
  - GPT-4 Vision za analizu slika
  - GPT-4o-mini za brand analizu (/api/analyze)
  - ChatGPT za generiranje sadržaja
  - fal.ai (Flux2) za generiranje slika — **max 4 image_urls po requestu**
- **Project ID:** `proj_local` (hardkodirano za development)

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
- **Komponente:** `src/ui/` folder (ChatBubble, ChatLayout, Button, Card, Chip, Avatar, Icons, Input)

---

## 2. GLAVNI FLOW APLIKACIJE

### 2.1 User Journey (6 koraka)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VISSOCIAL USER FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

[LANDING PAGE] ───► Korisnik unosi @handle
        │
        ▼
[STEP 1: PROFILE ANALYSIS] (/analyze/[handle])
        │   - GPT-4o-mini analizira profil
        │   - Prikazuje: Company, Services, Tone, Audience, Language
        │   - USP Analysis + Recommended Focus
        │
        ├───► "Sounds good → Continue" ───► /chat?from=analyze
        │
        ▼
[STEP 2: CONNECT INSTAGRAM] (/chat)
        │   - Init: 2 opcije (Spoji IG, Nastavi bez)
        │   - OAuth flow ili manual input
        │
        ├───► OAuth success ───► Instagram Ingest ───► Vision Analysis
        │
        ▼
[STEP 3: TAILOR 30-DAY PLAN] (/chat - onboarding)
        │   - Goal chips (engagement, branding, promotion, mix)
        │   - Profile type chips (product_brand, lifestyle, creator)
        │   - Focus chips (engagement, growth, promotion, storytelling)
        │
        ▼
[STEP 4: PRODUCT CONFIRMATION] (/chat)
        │   - Notifikacija s detektiranim proizvodima
        │   - Chip klik → confirm/reject → zelena kvačica
        │
        ▼
[STEP 5: CONTENT GENERATION] (/chat)
        │   - "Generiraj plan" → LLM + Flux2
        │
        ▼
[STEP 6: CALENDAR] (/calendar)
        │   - Pregled, edit, approve, schedule
```

### 2.2 FSM States

| Step | Opis | Sljedeći koraci |
|------|------|-----------------|
| `init` | Početni ekran | spoji IG, nastavi bez |
| `scrape_input` | Unos IG usernamea | scrape_complete |
| `scrape_complete` | Rezultati scrapinga | onboarding |
| `no_instagram_options` | Opcije bez IG | web stranica, uploaj |
| `website_input` | Unos URL-a | onboarding |
| `upload_reference` | Odabir tipa uploada | upload_style/product/character |
| `onboarding` | Onboarding pitanja | ready_to_generate |
| `ready_to_generate` | Potvrda generiranja | generating |
| `generating` | U tijeku | calendar |

### 2.3 Init Chips (V7 — samo 2 opcije)

```typescript
// src/app/api/chat/session/route.ts
chips: [
  { type: "navigation", label: "Spoji Instagram", href: "/api/instagram/login" },
  { type: "onboarding_option", label: "Nastavi bez Instagrama", value: "nastavi bez" }
]
```

---

## 3. NAVIGACIJSKA ARHITEKTURA (V3 — Dvoslojna)

### 3.1 Pregled

| Ruta | Header | Izvor |
|------|--------|-------|
| `/` | Landing header (Pricing, Log in, Sign up) | page.tsx inline |
| `/chat` | ChatLayout header (nav + step indicator) | ChatLayout.tsx |
| `/analyze/[handle]` | ChatLayout header (nav + step indicator) | ChatLayout.tsx |
| `/settings` | AppHeader (nav linkovi) | AppHeader.tsx via layout.tsx |
| `/profile` | AppHeader (nav linkovi) | AppHeader.tsx via layout.tsx |
| `/calendar` | AppHeader (nav linkovi) | AppHeader.tsx via layout.tsx |

### 3.2 NAV_ITEMS (dijeljeno)

```typescript
const NAV_ITEMS = [
  { label: "Chat", href: "/chat" },
  { label: "Calendar", href: "/calendar" },
  { label: "Profile", href: "/profile" },
  { label: "Settings", href: "/settings" },
];
```

---

## 4. PROFILE ANALYSIS STRANICA (V3)

### 4.1 API Endpoint

```
POST /api/analyze
  Body: { input: "@handle" | "https://url" | "Firma d.o.o." }
  Response: {
    success: boolean,
    input_type: "instagram_handle" | "web_url" | "company_name",
    basic: { handle, full_name, bio, followers, posts_count, profile_pic_url },
    analysis: {
      company, services, brand_tone, target_audience, language,
      usp_analysis, recommended_focus, strengths[], opportunities[]
    }
  }
  Timeout: 15s (GPT: 10s)
```

---

## 5. DESIGN SYSTEM KOMPONENTE (V3)

### 5.1 Folder struktura

```
src/ui/
├── index.ts              ← Barrel export
├── ChatBubble.tsx        ← Chat poruke, chipovi, avatari
├── ChatLayout.tsx        ← Layout za chat stranice
├── AppHeader.tsx         ← Navigacija za ostale stranice
├── Button.tsx            ← Button varijante
├── Card.tsx              ← Card wrapper
├── Chip.tsx              ← Standalone chip
├── Avatar.tsx            ← AI i User avatari
├── Icons.tsx             ← SVG ikone
└── Input.tsx             ← Input s label/error
```

### 5.2 ChatChipData tipovi

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

---

## 6. DATABASE SCHEMA (V4 — Ažurirano za produkciju)

### 6.1 Projects tablica (TOČNA SCHEMA)

```sql
projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  meta_access_token TEXT,         -- Instagram OAuth token
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

### 6.2 Assets tablica

```sql
assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  type TEXT,                   -- 'image', 'video'
  source TEXT,                 -- 'instagram', 'upload'
  url TEXT,                    -- MORA biti Vercel Blob URL u produkciji!
  label TEXT,                  -- 'style_reference', 'product_reference', etc.
  metadata JSONB,
  external_id TEXT,            -- IG media ID za duplicate detection
  created_at TIMESTAMPTZ
)
```

### 6.3 Chat Notifications tablica

```sql
chat_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  project_id TEXT DEFAULT 'proj_local',  -- V8 FIX: dodano za produkciju
  type TEXT,
  title TEXT,
  message TEXT,
  data JSONB,
  chips JSONB,
  payload JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)
```

### 6.4 Detected Products

```sql
detected_products (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  asset_id TEXT,
  analysis_id TEXT,            -- referenca na instagram_analyses.id
  product_name TEXT,
  category TEXT,
  visual_features JSONB,
  prominence TEXT,
  confidence NUMERIC,
  frequency INTEGER DEFAULT 1,
  source TEXT DEFAULT 'instagram',
  status TEXT CHECK (status IN ('pending', 'confirmed', 'rejected')),
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  UNIQUE(asset_id, product_name)
)
```

### 6.5 Instagram Analyses

```sql
instagram_analyses (
  id TEXT PRIMARY KEY,
  asset_id TEXT,
  project_id TEXT,
  analysis JSONB,
  model_version TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 6.6 Produkcijske migracije (sve izvršene)

```sql
-- V7 migracije
ALTER TABLE assets ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE detected_products ADD COLUMN IF NOT EXISTS analysis_id TEXT;
ALTER TABLE detected_products ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'instagram';

-- V8 migracije (produkcijski deploy)
ALTER TABLE chat_notifications ADD COLUMN IF NOT EXISTS project_id TEXT DEFAULT 'proj_local';
ALTER TABLE instagram_analyses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE instagram_analyses ADD COLUMN IF NOT EXISTS project_id TEXT;
```

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
// PRIJE (BUG): makePublicUrl(s3Key) → generira proxy URL koji ne radi u produkciji
// POSLIJE (FIX): makePublicUrl(uploadedUrl) → koristi Vercel Blob URL direktno

const uploadedUrl = await putObject(s3Key, buffer, contentType);
const publicUrl = makePublicUrl(uploadedUrl);  // ← MORA biti uploadedUrl, NE s3Key!
```

**Zašto:** `putObject` u produkciji vraća pravi Vercel Blob URL
(`https://tdtglu5leenek1zg.public.blob.vercel-storage.com/...`).
Stari kod je ignorirao taj URL i generirao `APP_URL/vissocial/...` proxy URL koji ne radi.

### 7.3 makePublicUrl logika

```
Input                              → Output
Vercel Blob URL (https://...blob)  → passthrough (as-is)
https:// URL                       → passthrough
MinIO relative path                → APP_URL/vissocial/{path}
```

---

## 8. INSTAGRAM → ANALIZA → NOTIFIKACIJA PIPELINE

### 8.1 Kompletni Flow

```
1. Instagram OAuth (/api/instagram/callback)
   → Token u projects.meta_access_token
   → ig_connected = true
   → Queue: q_ingest.add("instagram.ingest")

2. instagramIngest (worker na Railway)
   → Fetch media putem Graph API
   → Upload slike u Vercel Blob (allowOverwrite!)
   → INSERT assets s external_id i Vercel Blob URL
   → Queue: q_analyze za svaki asset

3. analyzeInstagram (worker)
   → GPT-4 Vision analiza (koristi Vercel Blob URL)
   → INSERT instagram_analyses
   → INSERT detected_products (analysis_id, source)
   → UPDATE brand_rebuild_events status

4. brandRebuild (worker)
   → Agregira visual_style, content_themes, caption_patterns
   → UPDATE brand_profiles
   → notify.analysisComplete() → chat_notifications

5. Frontend polling (5s)
   → GET /api/chat/notifications
   → Prikaže product_confirm chipove
   → Klik → POST /api/products/confirm → zelena kvačica
```

---

## 9. PRODUCTION DEPLOYMENT

### 9.1 Infrastruktura

| Service | Platform | Napomena |
|---------|----------|----------|
| Frontend (Next.js) | Vercel | Auto-deploy iz GitHub main |
| Worker (BullMQ) | Railway | Auto-deploy iz GitHub main |
| Database | Neon | PostgreSQL, zahtijeva SSL |
| Redis | Railway | BullMQ queue backend |
| Storage | Vercel Blob | Slike, renderovi |
| Image Gen | fal.ai | Flux2, max 4 image_urls |

### 9.2 Railway Environment Variables (OBAVEZNO)

```env
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
REDIS_URL=redis://default:...@switchyard.proxy.rlwy.net:54046
OPENAI_API_KEY=sk-...
FAL_KEY=...
BLOB_READ_WRITE_TOKEN=vercel_blob_...    # MORA biti isti kao na Vercel!
APP_URL=https://vissocial.vercel.app     # BEZ trailing slasha!
DEV_GENERATE_LIMIT=3                      # Za testiranje (default 30)
NODE_ENV=production
FAL_FLUX_EDIT_MODEL=flux-2/edit
```

**KRITIČNO:**
- `BLOB_READ_WRITE_TOKEN` mora biti na OBJE platforme (Vercel + Railway)
- `APP_URL` mora biti BEZ trailing slasha i BEZ newline/razmaka
- `DEV_GENERATE_LIMIT` radi samo na Railway (worker), ne na Vercel

### 9.3 SSL za Neon (db.ts)

```typescript
const isNeon = config.dbUrl?.includes("neon.tech");
const sslConfig = IS_PRODUCTION || isNeon ? { rejectUnauthorized: false } : false;
export const pool = new Pool({ connectionString: config.dbUrl, ssl: sslConfig });
```

### 9.4 Vercel API Routes — force-dynamic

```typescript
// OBAVEZNO na svim API routama koje čitaju iz baze:
export const dynamic = "force-dynamic";
```

Bez toga Vercel kešira response na build-u i nikad ne osvježi podatke.

### 9.5 fal.ai Ograničenja

```typescript
const FAL_MAX_IMAGE_URLS = 4;  // fal.ai limit
// prioritizeRefs(): 1 product → 1 style → 1 character → fill remaining
```

### 9.6 Debug Endpoints

```
GET  /api/debug/pipeline-status    — Pregled svih queue-ova, failed jobova, recentnih itema
POST /api/debug/clean-failed       — Očisti failed jobove iz Redis queue-ova
POST /api/debug/clean-old-packs    — Briše stare content packove
GET  /health                       — Health check
```

---

## 10. TESTIRANJE — FULL RESET PROCEDURA

### Kad trebaš čisto stanje:

**1. Neon SQL Editor:**
```sql
TRUNCATE 
  renders, content_features, content_items, content_packs,
  chat_notifications, chat_messages, chat_sessions,
  detected_products, instagram_analyses, brand_rebuild_events,
  brand_profiles, assets, user_actions
CASCADE;

UPDATE projects 
SET meta_access_token = NULL, ig_user_id = NULL, ig_connected = false 
WHERE id = 'proj_local';
```

**2. Očisti Redis:**
```powershell
Invoke-RestMethod -Method POST -Uri "https://vissocial.vercel.app/api/debug/clean-failed"
```

**3. Otvori Incognito prozor** → `https://vissocial.vercel.app`

**4. Provjeri pipeline nakon ingesta:**
```powershell
Invoke-RestMethod -Uri "https://vissocial.vercel.app/api/debug/pipeline-status" | ConvertTo-Json -Depth 10
```

**5. Provjeri URL-ove u bazi:**
```sql
SELECT id, LEFT(url, 80) FROM assets LIMIT 3;
-- Mora biti: https://tdtglu5leenek1zg.public.blob.vercel-storage.com/...
-- NE: https://vissocial.vercel.app/vissocial/...
```

---

## 11. API ENDPOINTS

### Chat
```
POST /api/chat/session          - Nova sesija
GET  /api/chat/session          - Učitaj sesiju
POST /api/chat/message          - Pošalji poruku (FSM)
GET  /api/chat/notifications    - Poll notifikacije
POST /api/chat/notifications    - Označi pročitano
POST /api/chat/reset            - Reset sesije i projekta
```

### Analyze (V3)
```
POST /api/analyze               - Dvofazna brand analiza (scrape + GPT)
```

### Content
```
GET  /api/content/latest        - Dohvati najnoviji content pack (force-dynamic!)
GET  /api/content/item          - Dohvati pojedini item
PATCH /api/content/item         - Update item
```

### Instagram
```
GET  /api/instagram/login       - OAuth start
GET  /api/instagram/callback    - OAuth callback
POST /api/instagram/scrape      - Web scraping profila
```

### Debug (SAMO za development)
```
GET  /api/debug/pipeline-status - Queue i job status
POST /api/debug/clean-failed    - Očisti failed Redis jobove
POST /api/debug/clean-old-packs - Briše stare packove
```

---

## 12. POZNATI BUGOVI I FIXES (POVIJEST)

### V1-V6 Fixes (sažetak)
- ✅ planGenerate column error (`arm_id` → `id`)
- ✅ BullMQ lockDuration (30s → 60s+)
- ✅ Notification sustav
- ✅ Duplicate messages fix
- ✅ OAuth redirect loop
- ✅ Reset API column (`ig_access_token` → `meta_access_token`)

### V7 Fixes
- ✅ Database: `assets.external_id` kolona
- ✅ Database: `detected_products.analysis_id` i `source` kolone
- ✅ Storage: `allowOverwrite: true` za Vercel Blob
- ✅ Product confirm: zelena kvačica nakon potvrde

### V8 — Production Deployment Fixes (24. veljače 2026)
- ✅ **SSL za Neon:** `db.ts` — Pool bez SSL config → dodana SSL konfiguracija
- ✅ **fal.ai limit:** `renderFlux.ts` — 5 referenci → max 4 s `prioritizeRefs()`
- ✅ **Vercel caching:** `content/latest/route.ts` — dodano `export const dynamic = "force-dynamic"`
- ✅ **Storage URL bug:** `instagramIngest.ts` — `makePublicUrl(s3Key)` → `makePublicUrl(uploadedUrl)`
- ✅ **APP_URL trailing slash:** Railway varijabla imala razmak/newline → očišćeno
- ✅ **BLOB_READ_WRITE_TOKEN:** Nedostajao na Railway → dodan
- ✅ **Missing DB columns:** `chat_notifications.project_id`, `instagram_analyses.created_at`, `instagram_analyses.project_id` → dodani ALTER TABLE
- ✅ **Redis monitoring:** Dodan ioredis za connection monitoring u worker.ts
- ✅ **BullMQ lock duration:** Render queue povećan na 180s za fal.ai
- ✅ **Worker logging:** Logger uključen u produkciji (bio isključen)
- ✅ **Health check:** `/health` endpoint za monitoring

### V3 Design System Migration
- ✅ Novi design system komponente (ChatBubble, ChatLayout, etc.)
- ✅ Dvoslojna navigacija (ChatLayout + AppHeader)
- ✅ Profile Analysis stranica (/analyze/[handle])
- ✅ Lavender gradient pozadina
- ✅ AI avatar (sparkle, NE robot)

---

## 13. CHECKLIST ZA DEVELOPMENT

Prije svakog odgovora:

- [ ] Koristi `project_knowledge_search` za provjeru koda
- [ ] Provjeri odgovara li database schema (TOČNA IMENA KOLONA!)
- [ ] Generiraj KOMPLETNE datoteke, ne snippete
- [ ] Redis port = **6380** (lokalno)
- [ ] Project ID = **"proj_local"**
- [ ] Token kolona = **meta_access_token** (NE ig_token!)
- [ ] IG user kolona = **ig_user_id** (NE meta_user_id!)
- [ ] IG connected kolona = **ig_connected** (boolean)
- [ ] Storage: **allowOverwrite: true** za Vercel Blob
- [ ] Storage: koristi **uploadedUrl** (NE s3Key) za makePublicUrl u produkciji
- [ ] API routes: dodaj `export const dynamic = "force-dynamic"` za DB queries
- [ ] fal.ai: max **4 image_urls** po requestu
- [ ] APP_URL: **BEZ trailing slasha**

---

## 14. BUDUĆE FAZE (TODO)

### Kratkoročno
- [ ] DEV_GENERATE_LIMIT enforcement (trenutno ne radi pouzdano)
- [ ] Proper database migration system (umjesto ručnih ALTER TABLE)
- [ ] Error handling poboljšanja na /analyze stranici

### Srednjoročno
- [ ] Multi-image upload
- [ ] Cleanup: obrisati Card.tsx, Badge.tsx ako se ne koriste
- [ ] Production monitoring (alerts za failed jobs)
- [ ] Rate limiting na API endpoints

### Dugoročno
- [ ] Shopify integration
- [ ] Automatic scheduling
- [ ] A/B testing za content
- [ ] Multi-tenant auth

---

**KRAJ DOKUMENTA**

*Ovaj dokument je autoritativan izvor znanja o Vissocial projektu.*
*Zadnje ažuriranje: 24. veljače 2026 — V8 Production Deployment Fixes*
