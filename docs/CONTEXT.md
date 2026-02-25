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
- **AI:** GPT-4 Vision, GPT-4o-mini, fal.ai Flux2 — **max 4 image_urls**, **safety checker OFF**
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
│  /settings → login  │                │  upload_reference /     │
│  project_id u state │                │  website_input          │
│  Meta OAuth flow    │                └────────────┬────────────┘
│  ⚠️ Mora biti       │                             │
│  Professional/      │                             │
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
| `onboarding` | Onboarding pitanja | ready_to_generate |
| `ready_to_generate` | Potvrda generiranja | generating |
| `generating` | U tijeku | calendar |

### 2.3 Init Chips (V9 — navigation tip)

```typescript
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

### 3.4 Migrirani fajlovi (19+ ruta)

Sve API rute koriste `getProjectId()` umjesto hardkodiranog `proj_local`. Potpuna lista u sekciji 12.

### 3.5 Worker konfiguracija (V9)

```typescript
// src/server/worker.ts
import 'dotenv/config';  // Potrebno za lokalni dev
const PORT = process.env.PORT || 3001;  // 3001 lokalno, Railway postavlja PORT
```

---

## 4. NAVIGACIJSKA ARHITEKTURA (V3 — Dvoslojna)

| Ruta | Header | Izvor |
|------|--------|-------|
| `/` | Landing header | page.tsx inline |
| `/chat` | ChatLayout (nav + step indicator) | ChatLayout.tsx |
| `/analyze/[handle]` | ChatLayout (nav + step indicator) | ChatLayout.tsx |
| `/settings` | AppHeader (nav linkovi) | AppHeader.tsx |
| `/profile` | AppHeader (nav linkovi) | AppHeader.tsx |
| `/calendar` | AppHeader (nav linkovi) | AppHeader.tsx |

---

## 5. DESIGN SYSTEM KOMPONENTE (V3)

```
src/ui/
├── ChatBubble.tsx        ← Chat poruke, chipovi, avatari
├── ChatLayout.tsx        ← Layout za chat stranice
├── AppHeader.tsx         ← Navigacija za ostale stranice
├── Button.tsx, Card.tsx, Chip.tsx, Avatar.tsx, Icons.tsx, Input.tsx
└── index.ts              ← Barrel export
```

### ChatChipData tipovi

```typescript
interface ChatChipData {
  type: "suggestion" | "onboarding_option" | "product_confirm" | 
        "navigation" | "action" | "file_upload" | "asset_delete";
  label: string;
  value?: string;
  href?: string;
  productId?: string;
  action?: "confirm" | "reject";
  confirmed?: boolean;
}
```

---

## 6. DATABASE SCHEMA (V5 — Multi-project)

### 6.1 Projects

```sql
projects (
  id TEXT PRIMARY KEY,          -- V9: dinamički "proj_XXXXXXXXXXXX"
  name TEXT,
  meta_access_token TEXT,       -- Instagram OAuth token (NE ig_token!)
  ig_user_id TEXT,              -- (NE meta_user_id!)
  ig_connected BOOLEAN DEFAULT false,
  ig_publish_enabled BOOLEAN DEFAULT false,
  fb_page_id TEXT,
  meta_token_expires_at TIMESTAMPTZ,
  plan_month TEXT, plan_type TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
```

### 6.2 Assets

```sql
assets (
  id TEXT PRIMARY KEY,
  project_id TEXT, type TEXT, source TEXT,
  url TEXT,                    -- MORA biti Vercel Blob URL u produkciji!
  label TEXT, metadata JSONB,
  external_id TEXT,            -- IG media ID
  created_at TIMESTAMPTZ
)
-- V9: UNIQUE INDEX idx_assets_project_external_id ON assets(project_id, external_id)
```

### 6.3 Ostale tablice

- `chat_sessions` (id, project_id, state JSONB)
- `chat_messages` (id, session_id, role, text, meta JSONB)
- `chat_notifications` (id, session_id, project_id, type, title, message, data, chips, read)
- `detected_products` (id, project_id, asset_id, analysis_id, product_name, category, status)
- `instagram_analyses` (id, asset_id, project_id, analysis JSONB, model_version)
- `brand_profiles` (project_id PK, language, profile JSONB)
- `brand_rebuild_events` (id, project_id, trigger_type, status, metadata)
- `content_packs`, `content_items`, `content_features`, `renders`
- `bandit_arms`, `user_actions`
- `_migrations` (name TEXT PK, applied_at) — V9 tracking

### 6.4 Migracije

```
src/db/migrations/001_complete_schema.sql
```

`npm run migrate` — preskače primijenjene, izvršava samo nove.
Produkcija: Neon SQL Editor ili `$env:DATABASE_URL="neon_url"; npm run migrate`

---

## 7. STORAGE SUSTAV

```typescript
// src/lib/storage.ts — auto-detection:
// Vercel Blob (production): BLOB_READ_WRITE_TOKEN postoji
// MinIO/S3 (local dev): S3Client na portu 9100

// KRITIČNO:
const publicUrl = makePublicUrl(uploadedUrl);  // MORA biti uploadedUrl, NE s3Key!
```

---

## 8. INSTAGRAM → ANALIZA → NOTIFIKACIJA PIPELINE

```
OAuth → project_id u state → callback čita state
  → instagramIngest → Vercel Blob upload
    → analyzeInstagram (×3) → GPT-4 Vision
      → brandRebuild → chat_notification
        → Frontend polling (5s) → product_confirm chipovi
```

---

## 9. PRODUCTION DEPLOYMENT

| Service | Platform | Auto-deploy |
|---------|----------|-------------|
| Frontend | Vercel | ✅ GitHub main |
| Worker | Railway | ✅ GitHub main |
| Database | Neon | N/A (SSL required) |
| Redis | Railway | N/A |
| Storage | Vercel Blob | N/A |
| Image Gen | fal.ai | N/A |

**KRITIČNO:**
- `BLOB_READ_WRITE_TOKEN` na OBJE platforme
- `APP_URL` BEZ trailing slasha
- `DATABASE_URL` s `?sslmode=require`
- `META_APP_ID/SECRET` postavljeni na Railway
- Credentials: `C:\Users\Velo\source\vissocial_chat\.credentials\vissocial-credentials.md`

### Debug Endpoints

```
GET  /api/debug/pipeline-status    — Queue status, failed jobs, recent items
POST /api/debug/clean-failed       — Očisti failed jobove
GET  /health                       — Health check
```

---

## 10. TESTIRANJE — FULL RESET

```sql
-- Neon SQL Editor:
TRUNCATE renders, content_features, content_items, content_packs,
  chat_notifications, chat_messages, chat_sessions,
  detected_products, instagram_analyses, brand_rebuild_events,
  brand_profiles, assets, user_actions CASCADE;
DELETE FROM projects WHERE id != 'proj_local';
```

Incognito prozor → novi projekt automatski (nema cookie).

---

## 11. API ENDPOINTS

```
POST /api/chat/session          — Nova sesija (getProjectId())
POST /api/chat/message          — Poruka (FSM)
GET  /api/chat/notifications    — Poll (5s)
POST /api/chat/reset            — "Nova sesija" → novi projekt + cookie
GET  /api/instagram/login       — OAuth (project_id u state)
GET  /api/instagram/callback    — OAuth callback
GET  /api/content/latest        — Content pack (force-dynamic!)
POST /api/analyze               — Brand analiza
GET  /api/debug/pipeline-status — Debug
```

---

## 12. POZNATI BUGOVI I FIXES

### V9 — Multi-User (25. veljače 2026)
- ✅ Dynamic project_id (cookie `vissocial_pid`)
- ✅ 19 API ruta migrirano na getProjectId()
- ✅ "Nova sesija", Instagram reconnect, OAuth state param
- ✅ Migration tracking (`_migrations` tablica)
- ✅ Assets per-project unique index
- ✅ Worker dotenv, port fix, scheduleTick return type
- ✅ fal.ai safety checker OFF

### V8 — Production (24. veljače 2026)
- ✅ SSL, fal.ai limit, Vercel caching, Storage URL, APP_URL, BLOB token
- ✅ Missing DB columns, Redis monitoring, BullMQ lock, Health check

### V7 — Pipeline Fixes
- ✅ DB kolone, allowOverwrite, Product confirm zelena kvačica

### V3 — Design System
- ✅ ChatBubble, ChatLayout, Profile Analysis, Lavender gradient

---

## 13. CHECKLIST ZA DEVELOPMENT

- [ ] Project ID = **`getProjectId()`** (NE "proj_local"!)
- [ ] Token = **meta_access_token** (NE ig_token!)
- [ ] IG user = **ig_user_id** (NE meta_user_id!)
- [ ] Storage: **`makePublicUrl(uploadedUrl)`** (NE s3Key!)
- [ ] fal.ai: max **4 refs**, **safety checker OFF**
- [ ] API routes: **`export const dynamic = "force-dynamic"`**
- [ ] APP_URL: **BEZ trailing slasha**
- [ ] Instagram: **Professional/Creator** account required
- [ ] Redis port: **6380** (lokalno)
- [ ] Nove rute: `import { getProjectId } from "@/lib/projectId"`

---

## 14. BUDUĆE FAZE

**Kratkoročno:** DEV_GENERATE_LIMIT, error handling, credential rotation
**Srednjoročno:** Multi-image upload, /profile editing, monitoring, rate limiting
**Dugoročno:** Shopify, auto-scheduling, A/B testing, proper auth sustav

---

*Zadnje ažuriranje: 25. veljače 2026 — V9 Multi-User & Dynamic Project ID*
