# VISSOCIAL - KOMPLETNI KONTEKST I ZNANJE O PROJEKTU

> **NAPOMENA:** Ovaj dokument služi kao autoritativni izvor znanja o Vissocial projektu. U slučaju proturječja s project knowledge ili drugim izvorima, **ovaj dokument ima prioritet**.
> 
> **Verzija:** 5.0 (Ažurirano: 25. veljače 2026)
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
        │   - Instagram zahtijeva Professional/Creator account
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

### 2.3 Init Chips (V9 — navigation tip)

```typescript
// src/app/api/chat/session/route.ts
chips: [
  { type: "navigation", label: "Spoji Instagram", href: "/settings" },
  { type: "onboarding_option", label: "Nastavi bez Instagrama", value: "nastavi bez" }
]
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
- `src/app/api/chat/session/route.ts`
- `src/app/api/chat/message/route.ts`
- `src/app/api/chat/notifications/route.ts`
- `src/app/api/chat/notify/route.ts`
- `src/app/api/chat/reset/route.ts`
- `src/app/api/instagram/login/route.ts`
- `src/app/api/instagram/callback/route.ts`
- `src/app/api/projects/me/route.ts`
- `src/app/api/content/latest/route.ts`
- `src/app/api/export/route.ts`
- `src/app/api/products/pending/route.ts`
- `src/app/api/products/route.ts`
- `src/app/api/profile/rebuild/route.ts`
- `src/app/api/profile/route.ts`
- `src/app/api/scrape/website/route.ts`
- `src/app/api/analyze/status/route.ts`
- `src/app/api/analyze/trigger/route.ts`
- `src/app/api/assets/presign/route.ts`
- `src/app/api/assets/references/route.ts`
- `src/app/api/assets/upload/route.ts`

### 3.5 Worker konfiguracija (V9)

```typescript
// src/server/worker.ts
import 'dotenv/config';  // Potrebno za lokalni dev (next dev auto-loadira .env)
const PORT = process.env.PORT || 3001;  // 3001 lokalno, Railway postavlja PORT
```

---

## 4. NAVIGACIJSKA ARHITEKTURA (V3 — Dvoslojna)

### 4.1 Pregled

| Ruta | Header | Izvor |
|------|--------|-------|
| `/` | Landing header (Pricing, Log in, Sign up) | page.tsx inline |
| `/chat` | ChatLayout header (nav + step indicator) | ChatLayout.tsx |
| `/analyze/[handle]` | ChatLayout header (nav + step indicator) | ChatLayout.tsx |
| `/settings` | AppHeader (nav linkovi) | AppHeader.tsx via layout.tsx |
| `/profile` | AppHeader (nav linkovi) | AppHeader.tsx via layout.tsx |
| `/calendar` | AppHeader (nav linkovi) | AppHeader.tsx via layout.tsx |

### 4.2 NAV_ITEMS (dijeljeno)

```typescript
const NAV_ITEMS = [
  { label: "Chat", href: "/chat" },
  { label: "Calendar", href: "/calendar" },
  { label: "Profile", href: "/profile" },
  { label: "Settings", href: "/settings" },
];
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

## 6. DATABASE SCHEMA (V5 — Multi-project)

### 6.1 Projects tablica

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
-- V9: Unique constraint je per-project (NE globalni!)
-- UNIQUE INDEX idx_assets_project_external_id ON assets(project_id, external_id) WHERE external_id IS NOT NULL
```

### 6.3 Migration Tracking tablica (V9)

```sql
_migrations (
  name TEXT PRIMARY KEY,       -- npr. '001_complete_schema.sql'
  applied_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 6.4 Migracije

```
src/db/migrations/
└── 001_complete_schema.sql    -- Kompletna schema (sve tablice)
```

**Pokretanje:** `npm run migrate` (koristi `src/lib/sql.ts`)
- Kreira `_migrations` tablicu ako ne postoji
- Preskače već primijenjene migracije
- Izvršava samo nove `.sql` datoteke
- Radi identično lokalno i na produkciji

**Produkcijska migracija:**
- Opcija A: Neon SQL Editor u browseru
- Opcija B: `$env:DATABASE_URL="neon_url"; npm run migrate`

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

### 8.1 Kompletni Flow

```
1. Instagram OAuth (/api/instagram/callback)
   → Čita project_id iz OAuth state parametra (V9)
   → Token u projects.meta_access_token
   → ig_connected = true
   → Detektira promjenu IG accounta (V9)
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
| Image Gen | fal.ai | Flux2, max 4 image_urls, safety checker OFF |

### 9.2 Environment Variables

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

**KRITIČNO:**
- `BLOB_READ_WRITE_TOKEN` mora biti na OBJE platforme (Vercel + Railway)
- `APP_URL` mora biti BEZ trailing slasha i BEZ newline/razmaka
- `DATABASE_URL` mora imati `?sslmode=require` na obje platforme
- `META_APP_ID` i `META_APP_SECRET` moraju biti postavljeni na Railway (ne "replace_me"!)
- Credentials referenca: `C:\Users\Velo\source\vissocial_chat\.credentials\vissocial-credentials.md`

### 9.3 SSL za Neon (db.ts)

```typescript
const isNeon = config.dbUrl?.includes("neon.tech");
const sslConfig = IS_PRODUCTION || isNeon ? { rejectUnauthorized: false } : false;
export const pool = new Pool({ connectionString: config.dbUrl, ssl: sslConfig });
```

### 9.4 Vercel API Routes — force-dynamic

```typescript
export const dynamic = "force-dynamic";
```

### 9.5 fal.ai Konfiguracija

```typescript
const FAL_MAX_IMAGE_URLS = 4;  // fal.ai limit
enable_safety_checker: false    // V9: isključen jer blokira product slike
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

-- V9: Za brisanje svih projekata:
DELETE FROM projects WHERE id != 'proj_local';
-- Ili za reset specifičnog projekta:
UPDATE projects 
SET meta_access_token = NULL, ig_user_id = NULL, ig_connected = false 
WHERE id = 'proj_local';
```

**2. Očisti Redis:**
```powershell
Invoke-RestMethod -Method POST -Uri "https://vissocial.vercel.app/api/debug/clean-failed"
```

**3. Otvori Incognito prozor** → `https://vissocial.vercel.app`
(Incognito nema cookie → novi projekt automatski)

---

## 11. API ENDPOINTS

### Chat
```
POST /api/chat/session          - Nova sesija (koristi getProjectId())
GET  /api/chat/session          - Učitaj sesiju
POST /api/chat/message          - Pošalji poruku (FSM)
GET  /api/chat/notifications    - Poll notifikacije
POST /api/chat/notifications    - Označi pročitano
POST /api/chat/reset            - "Nova sesija" — kreira novi projekt + cookie
```

### Instagram
```
GET  /api/instagram/login       - OAuth start (project_id u state param)
GET  /api/instagram/callback    - OAuth callback (čita project_id iz state)
POST /api/instagram/scrape      - Web scraping profila
```

### Content
```
GET  /api/content/latest        - Dohvati najnoviji content pack (force-dynamic!)
GET  /api/content/item          - Dohvati pojedini item
PATCH /api/content/item         - Update item
```

### Analyze (V3)
```
POST /api/analyze               - Dvofazna brand analiza (scrape + GPT)
```

### Debug (SAMO za development)
```
GET  /api/debug/pipeline-status - Queue i job status
POST /api/debug/clean-failed    - Očisti failed Redis jobove
POST /api/debug/clean-old-packs - Briše stare packove
```

---

## 12. POZNATI BUGOVI I FIXES (POVIJEST)

### V9 — Multi-User & Dynamic Project ID (25. veljače 2026)
- ✅ **Dynamic project_id:** Cookie-based izolacija korisnika (`vissocial_pid`)
- ✅ **`src/lib/projectId.ts`:** getProjectId(), readProjectId(), setProjectIdCookie(), ensureProject()
- ✅ **19 API ruta migrirano:** Sve koriste getProjectId() umjesto hardkodiranog `proj_local`
- ✅ **"Nova sesija" gumb:** Kreira novi projekt, postavlja novi cookie
- ✅ **Instagram reconnect:** Detektira promjenu IG accounta, čisti stare podatke
- ✅ **OAuth state param:** project_id putuje kroz OAuth flow
- ✅ **Migration tracking:** `_migrations` tablica, `npm run migrate` preskače primijenjene
- ✅ **Assets unique index:** Per-project umjesto globalnog (`idx_assets_project_external_id`)
- ✅ **Worker dotenv:** `import 'dotenv/config'` za lokalni dev
- ✅ **Worker port:** `PORT || 3001` (izbjegava konflikt s Next.js na 3000)
- ✅ **fal.ai safety checker:** Isključen (`enable_safety_checker: false`)
- ✅ **scheduleTick return type:** `return {} as ScheduleTickResult`

### V8 — Production Deployment Fixes (24. veljače 2026)
- ✅ SSL za Neon, fal.ai limit, Vercel caching, Storage URL bug
- ✅ APP_URL trailing slash, BLOB_READ_WRITE_TOKEN, Missing DB columns
- ✅ Redis monitoring, BullMQ lock duration, Worker logging, Health check

### V7 Fixes
- ✅ Database kolone, Storage allowOverwrite, Product confirm zelena kvačica

### V3 Design System
- ✅ ChatBubble, ChatLayout, Profile Analysis, Lavender gradient, AI sparkle avatar

---

## 13. CHECKLIST ZA DEVELOPMENT

Prije svakog odgovora:

- [ ] Koristi `project_knowledge_search` za provjeru koda
- [ ] Provjeri odgovara li database schema (TOČNA IMENA KOLONA!)
- [ ] Generiraj KOMPLETNE datoteke, ne snippete
- [ ] Redis port = **6380** (lokalno)
- [ ] Project ID = **dinamički via `getProjectId()`** (NE hardkodirani "proj_local"!)
- [ ] Token kolona = **meta_access_token** (NE ig_token!)
- [ ] IG user kolona = **ig_user_id** (NE meta_user_id!)
- [ ] IG connected kolona = **ig_connected** (boolean)
- [ ] Storage: **allowOverwrite: true** za Vercel Blob
- [ ] Storage: koristi **uploadedUrl** (NE s3Key) za makePublicUrl u produkciji
- [ ] API routes: dodaj `export const dynamic = "force-dynamic"` za DB queries
- [ ] fal.ai: max **4 image_urls** po requestu, **safety checker OFF**
- [ ] APP_URL: **BEZ trailing slasha**
- [ ] Nove API rute: koristi `import { getProjectId } from "@/lib/projectId"`
- [ ] Instagram zahtijeva **Professional/Creator** account (ne Personal)

---

## 14. BUDUĆE FAZE (TODO)

### Kratkoročno
- [ ] DEV_GENERATE_LIMIT enforcement (trenutno ne radi pouzdano)
- [ ] Error handling poboljšanja na /analyze stranici
- [ ] Credential rotation (keyevi dijeljeni u chatu)

### Srednjoročno
- [ ] Multi-image upload
- [ ] Cleanup: obrisati Card.tsx, Badge.tsx ako se ne koriste
- [ ] Production monitoring (alerts za failed jobs)
- [ ] Rate limiting na API endpoints
- [ ] /profile stranica s brand editing

### Dugoročno
- [ ] Shopify integration
- [ ] Automatic scheduling
- [ ] A/B testing za content
- [ ] Proper auth sustav (zamjena za cookie-based project isolation)

---

**KRAJ DOKUMENTA**

*Ovaj dokument je autoritativan izvor znanja o Vissocial projektu.*
*Zadnje ažuriranje: 25. veljače 2026 — V9 Multi-User & Dynamic Project ID*
