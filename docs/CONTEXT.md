# VISSOCIAL - KOMPLETNI KONTEKST I ZNANJE O PROJEKTU

> **NAPOMENA:** Ovaj dokument služi kao autoritativni izvor znanja o Vissocial projektu. U slučaju proturječja s project knowledge ili drugim izvorima, **ovaj dokument ima prioritet**.
> 
> **Verzija:** 3.0 (Ažurirano: 7. veljače 2026)
> **Branch:** `feature/design_initial` (aktivni development)
> **GitHub:** Projekt je spojen s GitHub repozitorijem - kod se redovito sync-a

---

## 1. PREGLED PROJEKTA

**Vissocial** je AI-powered Instagram content management platforma s chat-first sučeljem. Korisnik kroz razgovor s AI asistentom prolazi onboarding, analizira svoj brand, potvrđuje proizvode i generira sadržaj za Instagram.

### 1.1 Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, BullMQ background workers
- **Database:** PostgreSQL
- **Storage:** MinIO (S3-compatible, port **9100**) / Vercel Blob (production)
- **Queue:** BullMQ + Redis na portu **6380** (NE 6379!)
- **AI:** 
  - GPT-4 Vision za analizu slika
  - GPT-4o-mini za brand analizu (/api/analyze)
  - ChatGPT za generiranje sadržaja
  - fal.ai (Flux2) za generiranje slika
- **Project ID:** `proj_local` (hardkodirano za development)

### 1.2 Lokacija koda
```
C:\Users\Velo\source\vissocial_chat\vissocial_app\
```

### 1.3 Design System (V2 — Contently stil)
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

[LANDING PAGE] ──► Korisnik unosi @handle
        │
        ▼
[STEP 1: PROFILE ANALYSIS] (/analyze/[handle])
        │   - GPT-4o-mini analizira profil
        │   - Prikazuje: Company, Services, Tone, Audience, Language
        │   - USP Analysis + Recommended Focus
        │
        ├──► "Sounds good → Continue" ──► /chat?from=analyze
        │
        ▼
[STEP 2: CONNECT INSTAGRAM] (/chat)
        │   - Init: 2 opcije (Spoji IG, Nastavi bez)
        │   - OAuth flow ili manual input
        │
        ├──► OAuth success ──► Instagram Ingest ──► Vision Analysis
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

**NAPOMENA (V7):** "Brzi pregled profila" uklonjen iz init stepa. Korisnici koji žele preview idu kroz /analyze stranicu.

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

### 3.2 ChatLayout.tsx — Za /chat i /analyze

```typescript
// src/ui/ChatLayout.tsx
interface ChatLayoutProps {
  children: React.ReactNode;
  currentStep?: number;      // 1-6
  totalSteps?: number;       // default 6
  stepTitle?: string;        // "Profile analysis", "Connect Instagram"...
  showSteps?: boolean;
  onNewSession?: () => void; // "Nova sesija" button
}
```

**Sadrži:**
- Fixed header sa Vissocial logom
- NAV_ITEMS linkovi (Chat, Calendar, Profile, Settings)
- Step indicator ("Step 1 of 6")
- "Nova sesija" button (optional)
- Lavender gradient pozadina

### 3.3 AppHeader.tsx — Za ostale stranice

```typescript
// src/ui/AppHeader.tsx
// Client component s usePathname() za active state
// Vraća null na "/" i "/chat" (te stranice imaju svoj header)
```

**Stilovi:**
- Background: `lavender-100/95` + `backdrop-blur-md`
- Active link: `gray-900` text, `white/60` bg
- Inactive: `gray-500` text → hover `gray-700`

### 3.4 NAV_ITEMS (dijeljeno)

```typescript
const NAV_ITEMS = [
  { label: "Chat", href: "/chat" },
  { label: "Calendar", href: "/calendar" },
  { label: "Profile", href: "/profile" },
  { label: "Settings", href: "/settings" },
];
```

---

## 4. PROFILE ANALYSIS STRANICA (V3 — NOVO)

### 4.1 Arhitektura

```
src/app/analyze/
├── [handle]/
│   ├── page.tsx                  ← Server component (metadata)
│   └── ProfileAnalysisClient.tsx ← Client component (UI + API)
```

### 4.2 API Endpoint

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

### 4.3 ProfileAnalysisClient States

1. **Loading:** Skeleton animacije (HeaderSkeleton, QuickFactsSkeleton, USPSkeleton)
2. **Error:** 4 tipa (timeout, network, not_found, generic) s retry buttonom
3. **Success:** Progressive reveal s FadeInSection (staggered delays 200-800ms)

### 4.4 Action Footer

- **Primary:** "Sounds good → Continue" → `localStorage("analyze_result")` + `/chat?from=analyze`
- **Secondary:** "This doesn't feel right" → `/`
- **Hint:** "You can adjust this later. Nothing is locked in."

### 4.5 /chat Integration (from=analyze)

```typescript
// src/app/chat/page.tsx
useEffect(() => {
  if (searchParams.get("from") === "analyze") {
    const stored = localStorage.getItem("analyze_result");
    // Parse stored data
    // Create context message with profile info
    // Replace welcome message (NE šalje na backend)
    // Clear localStorage
    router.replace("/chat");
  }
}, [searchParams]);
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

### 5.2 ChatBubble.tsx — Ključne komponente

```typescript
// Tipovi
interface ChatMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  chips?: ChatChipData[];
  metadata?: { title, subtitle, fields[] };
}

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

// Komponente
export function ChatBubble({ message, onChipClick, ... })
export function ActionButton({ label, onClick, variant, ... })
export function ActionFooter({ primaryLabel, secondaryLabel, ... })
```

### 5.3 Design Tokens

```css
/* src/app/globals.css */
:root {
  --color-primary-500: #FFCA28;
  --color-primary-600: #FFB300;
  --color-lavender-100: #F8F7FF;
  --color-lavender-200: #F4F3FF;
  --shadow-card: 0 4px 20px -2px rgb(0 0 0 / 0.08);
  --shadow-chat: 0 2px 8px -2px rgb(0 0 0 / 0.08);
}
```

### 5.4 Tailwind Custom Classes

```css
.bg-gradient-lavender { background: linear-gradient(135deg, #f5f3ff, #ede9fe, #e9d5ff); }
.shadow-chat { box-shadow: var(--shadow-chat); }
.btn-primary { @apply bg-primary-500 hover:bg-primary-600 text-gray-900 font-semibold rounded-xl; }
```

---

## 6. CHAT PAGE BRIDGE (page.tsx)

### 6.1 Adapter Pattern

```typescript
// Konvertira interni Msg format → ChatMessage za ChatBubble
function toDesignMessage(m: Msg): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.text,
    metadata: m.metadata,
    chips: m.chips?.map(chip => {
      if (typeof chip === "string") {
        return { type: "suggestion", label: chip, value: chip };
      }
      return {
        type: chip.type || "suggestion",
        label: chip.label,
        value: chip.value || chip.label,
        confirmed: chip.confirmed,  // V7
        // ... ostali props
      };
    }),
  };
}
```

### 6.2 handleSmartChipClick — Special Chips

```typescript
// ChatBubble šalje samo value, ali trebamo full chip za:
async function handleSmartChipClick(value: string, msgId: string) {
  const msg = msgs.find(m => m.id === msgId);
  const chip = msg?.chips?.find(c => ...);

  // product_confirm → API + vizualni feedback
  if (chip.type === "product_confirm") {
    await fetch("/api/products/confirm", ...);
    setMsgs(prev => /* update chip.confirmed = true */);
    return; // NE šalje chat poruku!
  }

  // navigation → router.push
  if (chip.type === "navigation" && chip.href) {
    router.push(chip.href);
    return;
  }

  // file_upload → hidden input click
  // asset_delete → confirm + API

  // Default: šalje kao chat poruku
  handleChipAction(value);
}
```

### 6.3 Product Confirm Vizualni Feedback (V7)

```typescript
// Prije: ☐ Product Name — bijeli chip
// Poslije: ✅ Product Name — zeleni chip s kvačicom

// U Chip komponenti (ChatBubble.tsx):
const isConfirmed = chip.confirmed === true;
// Confirmed stil: bg-green-50 text-green-700 border-green-400
```

---

## 7. DATABASE SCHEMA (V3 — Ažurirano)

### 7.1 Glavne tablice

```sql
-- Projects
projects (
  id TEXT PRIMARY KEY,
  meta_access_token TEXT,      -- Instagram OAuth token (NE ig_access_token!)
  meta_user_id TEXT,
  ig_username TEXT,
  created_at TIMESTAMPTZ
)

-- Assets (V7: dodana external_id)
assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  type TEXT,                   -- 'image', 'video'
  source TEXT,                 -- 'instagram', 'upload'
  url TEXT,
  label TEXT,                  -- 'style_reference', 'product_reference', 'character_reference'
  metadata JSONB,
  external_id TEXT,            -- V7: IG media ID za duplicate detection
  created_at TIMESTAMPTZ
)

-- Detected Products (V7: dodane analysis_id, source)
detected_products (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  asset_id TEXT,
  analysis_id TEXT,            -- V7: referenca na instagram_analyses.id
  product_name TEXT,
  category TEXT,
  visual_features JSONB,
  prominence TEXT,
  confidence NUMERIC,
  frequency INTEGER DEFAULT 1,
  source TEXT DEFAULT 'instagram_vision',  -- V7
  status TEXT CHECK (status IN ('pending', 'confirmed', 'rejected')),
  UNIQUE(asset_id, product_name)
)

-- Chat Sessions
chat_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  state JSONB,                 -- FSM state: { step, goal, profile_type, focus, ... }
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Chat Messages
chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  role TEXT,
  text TEXT,
  meta JSONB,                  -- { chips: [...] }
  created_at TIMESTAMPTZ
)

-- Brand Profiles
brand_profiles (
  id TEXT PRIMARY KEY,
  project_id TEXT UNIQUE,
  visual_style JSONB,
  content_themes JSONB,
  caption_patterns JSONB,
  brand_consistency JSONB,
  updated_at TIMESTAMPTZ
)
```

### 7.2 V7 Migracije

```sql
-- Dodaj external_id za Instagram duplicate detection
ALTER TABLE assets ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_external_id ON assets(external_id) WHERE external_id IS NOT NULL;

-- Dodaj analysis_id i source za product tracking
ALTER TABLE detected_products ADD COLUMN IF NOT EXISTS analysis_id TEXT;
ALTER TABLE detected_products ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'instagram_vision';
```

---

## 8. STORAGE SUSTAV (V3)

### 8.1 Hybrid Storage

```typescript
// src/lib/storage.ts
// Auto-detection putem BLOB_READ_WRITE_TOKEN env varijable:
// - Vercel Blob (production): BLOB_READ_WRITE_TOKEN postoji
// - MinIO/S3 (local dev): S3Client na portu 9100
```

### 8.2 Vercel Blob Fix (V7)

```typescript
// KRITIČNO: allowOverwrite za re-ingest
async function putObjectBlob(key: string, body: Buffer, contentType: string) {
  const blob = await put(key, body, {
    access: "public",
    contentType,
    allowOverwrite: true,  // V7 FIX: re-ingest koristi iste keyeve
  });
  return blob.url;
}
```

### 8.3 URL Helpers

```typescript
// src/lib/storageUrl.ts
makePublicUrl()        // interno → HTTPS proxy za Vision API
validateVisionUrl()    // provjera da URL radi za OpenAI
getInternalStorageUrl() // server-side pristup MinIO-u

// src/lib/makePublicUrl.ts
// Vercel Blob → passthrough
// MinIO → APP_URL/vissocial/... proxy
```

---

## 9. INSTAGRAM → ANALIZA → NOTIFIKACIJA PIPELINE

### 9.1 Kompletni Flow

```
1. Instagram OAuth (/api/instagram/callback)
   → Token u projects.meta_access_token
   → Queue: q_ingest.add("instagram.ingest")

2. instagramIngest (worker)
   → Fetch media putem Graph API
   → Upload slike u storage (allowOverwrite!)
   → INSERT assets s external_id
   → Queue: q_analyze za svaki asset

3. analyzeInstagram (worker)
   → GPT-4 Vision analiza
   → INSERT instagram_analyses
   → INSERT detected_products (analysis_id, source)
   → UPDATE brand_rebuild_events status

4. brandRebuild (worker)
   → Agregira visual_style, content_themes, caption_patterns
   → UPDATE brand_profiles
   → notify.analysisComplete()

5. Frontend polling (5s)
   → GET /api/chat/notifications
   → Prikaže product_confirm chipove
   → Klik → POST /api/products/confirm → zelena kvačica
```

### 9.2 brand_rebuild_events Lifecycle

```
pending → analyzing → ready → rebuilding → completed
                                        → failed
                                        → skipped (no analyses)
```

---

## 10. API ENDPOINTS

### Chat
```
POST /api/chat/session          - Nova sesija
GET  /api/chat/session          - Učitaj sesiju
POST /api/chat/message          - Pošalji poruku (FSM)
GET  /api/chat/notifications    - Poll notifikacije
POST /api/chat/notifications    - Označi pročitano
POST /api/chat/reset            - Reset sesije i projekta
```

### Analyze (V3 — NOVO)
```
POST /api/analyze               - Dvofazna brand analiza (scrape + GPT)
```

### Instagram
```
GET  /api/instagram/login       - OAuth start
GET  /api/instagram/callback    - OAuth callback
POST /api/instagram/scrape      - Web scraping profila
```

### Profile
```
GET   /api/profile              - Dohvati brand profil
PATCH /api/profile              - Ažuriraj brand profil
POST  /api/profile/rebuild      - Pokreni rebuild
```

### Products
```
GET    /api/products            - Lista proizvoda
POST   /api/products/confirm    - Potvrdi proizvod
POST   /api/products/reject     - Odbaci proizvod
PATCH  /api/products/[id]       - Update proizvod
```

### Assets
```
POST   /api/assets/upload       - Upload slike (s labelom)
GET    /api/assets/references   - Dohvati reference images
DELETE /api/assets/[id]         - Obriši asset
```

---

## 11. ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vissocial

# Redis (VAŽNO: port 6380!)
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

# Instagram OAuth
META_APP_ID=...
META_APP_SECRET=...
APP_URL=https://your-ngrok-url.ngrok-free.dev
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
- ✅ Reference image upload system
- ✅ Upload reference loop fix
- ✅ Profile page null safety

### V7 Fixes
- ✅ Uklonjen "Brzi pregled profila" iz INIT — samo 2 opcije
- ✅ /analyze → /chat kontekst passing bez backend poziva
- ✅ Database: `assets.external_id` kolona
- ✅ Database: `detected_products.analysis_id` i `source` kolone
- ✅ Storage: `allowOverwrite: true` za Vercel Blob
- ✅ Product confirm: zelena kvačica nakon potvrde
- ✅ Product confirm: uklonjen handleChipAction() nakon API

### V3 Design System Migration
- ✅ Novi design system komponente (ChatBubble, ChatLayout, etc.)
- ✅ Dvoslojna navigacija (ChatLayout + AppHeader)
- ✅ Profile Analysis stranica (/analyze/[handle])
- ✅ Lavender gradient pozadina
- ✅ AI avatar (sparkle, NE robot)
- ✅ Tailwind custom boje (primary, lavender)

---

## 13. FOLDER STRUKTURA (V3)

```
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx              ← Root layout + AppHeader
│   ├── page.tsx                ← Landing page
│   ├── analyze/
│   │   └── [handle]/
│   │       ├── page.tsx        ← Server component
│   │       └── ProfileAnalysisClient.tsx
│   ├── chat/
│   │   └── page.tsx            ← Chat s FSM
│   ├── calendar/
│   ├── profile/
│   └── settings/
├── ui/
│   ├── index.ts
│   ├── ChatBubble.tsx
│   ├── ChatLayout.tsx
│   ├── AppHeader.tsx
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Chip.tsx
│   ├── Avatar.tsx
│   ├── Icons.tsx
│   └── Input.tsx
├── lib/
│   ├── config.ts
│   ├── db.ts
│   ├── storage.ts
│   ├── storageUrl.ts
│   └── notifications.ts
└── server/
    └── processors/
        ├── instagramIngest.ts
        ├── analyzeInstagram.ts
        ├── brandRebuild.ts
        └── planGenerate.ts
```

---

## 14. CHECKLIST ZA DEVELOPMENT

Prije svakog odgovora:

- [ ] Koristi `project_knowledge_search` za provjeru koda
- [ ] Provjeri odgovara li database schema
- [ ] Generiraj KOMPLETNE datoteke, ne snippete
- [ ] Redis port = **6380**
- [ ] Project ID = **"proj_local"**
- [ ] Token kolona = **meta_access_token**
- [ ] Storage: **allowOverwrite: true** za Vercel Blob
- [ ] Komponente u **src/ui/** (NE src/components/)
- [ ] ChatChipData ima **confirmed** prop za vizualni feedback

---

## 15. BUDUĆE FAZE (TODO)

### Kratkoročno
- [ ] Error handling poboljšanja na /analyze stranici
- [ ] Toast notifikacije za upload success/error
- [ ] Step indicator dinamičko ažuriranje u ChatLayout

### Srednjoročno
- [ ] Multi-image upload
- [ ] Cleanup: obrisati Card.tsx, Badge.tsx ako se ne koriste
- [ ] Cleanup: obrisati ChipButton iz page.tsx (handleSmartChipClick ga zamjenjuje)

### Dugoročno
- [ ] Shopify integration
- [ ] Automatic scheduling
- [ ] A/B testing za content

---

**KRAJ DOKUMENTA**

*Ovaj dokument je autoritativan izvor znanja o Vissocial projektu.*
*Zadnje ažuriranje: 7. veljače 2026 — V3 Design System Migration + V7 Fixes*
