# VISSOCIAL - KOMPLETNI KONTEKST I ZNANJE O PROJEKTU

> **NAPOMENA:** Ovaj dokument služi kao autoritativni izvor znanja o Vissocial projektu. U slučaju proturječja s project knowledge ili drugim izvorima, **ovaj dokument ima prioritet**.
> 
> **Verzija:** 2.0 (Ažurirano: Veljača 2026)
> **GitHub:** Projekt je spojen s GitHub repozitorijem - kod se redovito sync-a

---

## 1. PREGLED PROJEKTA

**Vissocial** je AI-powered Instagram content management platforma s chat-first sučeljem. Korisnik kroz razgovor s AI asistentom prolazi onboarding, analizira svoj brand, potvrđuje proizvode i generira sadržaj za Instagram.

### 1.1 Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, BullMQ background workers
- **Database:** PostgreSQL
- **Storage:** MinIO (S3-compatible) na portu **9100**
- **Queue:** BullMQ + Redis na portu **6380** (NE 6379!)
- **AI:** 
  - GPT-4 Vision za analizu slika
  - ChatGPT za generiranje sadržaja
  - fal.ai (Flux2) za generiranje slika
- **Project ID:** `proj_local` (hardkodirano za development)

### 1.2 Lokacija koda
```
C:\Users\Velo\source\vissocial_chat\vissocial_app\
```

---

## 2. GLAVNI FLOW APLIKACIJE - ONBOARDING FSM

### 2.1 FSM (Finite State Machine) - Trenutno stanje

Chat koristi FSM za praćenje korisnika kroz onboarding. State se sprema u `chat_sessions.state` (JSONB).

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ONBOARDING FSM                               │
└─────────────────────────────────────────────────────────────────────┘

[INIT] ──► Korisnik otvara chat
   │
   ├──► "Spoji Instagram" ──► OAuth ──► [ONBOARDING]
   │
   ├──► "Brzi pregled" ──► [SCRAPE_INPUT] ──► username ──► [SCRAPE_COMPLETE]
   │                                                              │
   │                                                              ▼
   ├──► "Nastavi bez IG" ──► [NO_INSTAGRAM_OPTIONS]          [ONBOARDING]
   │                              │
   │                              ├──► "Web stranica" ──► [WEBSITE_INPUT]
   │                              │                            │
   │                              │                            ▼ (scraping)
   │                              │                        [ONBOARDING]
   │                              │
   │                              └──► "Uploaj slike" ──► [UPLOAD_REFERENCE]
   │                                                            │
   │                                                            ▼
   │                                    ┌────────────────────────────────┐
   │                                    │    UPLOAD TYPE SELECTION       │
   │                                    ├────────────────────────────────┤
   │                                    │ • "upload stil" → UPLOAD_STYLE │
   │                                    │ • "upload proizvod" → UPLOAD_PRODUCT
   │                                    │ • "upload lik" → UPLOAD_CHARACTER
   │                                    │ • "preskoči" → ONBOARDING      │
   │                                    └────────────────────────────────┘
   │
   └──► [ONBOARDING] ◄─────────────────────────────────────────────────┘
              │
              │   Progress: 📊 Napredak: X/5
              │   ⬜/✅ Vizualna referenca
              │   ⬜/✅ Cilj
              │   ⬜/✅ Tip profila
              │   ⬜/✅ Fokus
              │   ⬜/✅ Proizvodi/reference
              │
              ├──► goal chips → state.goal = "branding|engagement|..."
              ├──► profile_type chips → state.profile_type = "creator|lifestyle|..."
              ├──► focus chips → state.focus = "storytelling|growth|..."
              │
              ▼
   [READY_TO_GENERATE] ──► "generiraj plan sada" ──► [GENERATING]
              │
              ▼
         [CALENDAR]
```

### 2.2 Step States

| Step | Opis | Sljedeći koraci |
|------|------|-----------------|
| `init` | Početni ekran | spoji IG, brzi pregled, nastavi bez |
| `scrape_input` | Unos IG usernamea | scrape_complete |
| `scrape_complete` | Rezultati scrapinga | onboarding, web stranica |
| `no_instagram_options` | Opcije bez IG | brzi pregled, web stranica, uploaj |
| `website_input` | Unos URL-a | onboarding (nakon scrapinga) |
| `upload_reference` | Odabir tipa uploada | upload_style/product/character |
| `upload_style_reference` | Upload stil slika | upload_reference, onboarding |
| `upload_product_reference` | Upload proizvoda | upload_reference, onboarding |
| `upload_character_reference` | Upload likova | upload_reference, onboarding |
| `onboarding` | Onboarding pitanja | ready_to_generate |
| `ready_to_generate` | Potvrda generiranja | generating |
| `generating` | U tijeku | - |

### 2.3 Onboarding Progress Tracking

```typescript
interface OnboardingProgress {
  ig_connected: boolean;
  has_reference_image: boolean;   // assets s label = *_reference
  has_products: boolean;          // detected_products count > 0
  has_confirmed_products: boolean; // detected_products status = 'confirmed'
  has_goal: boolean;              // state.goal postoji
  has_profile_type: boolean;      // state.profile_type postoji
  has_focus: boolean;             // state.focus postoji
  analysis_complete: boolean;     // instagram_analyses count > 0
}

// Može generirati kad:
const canGenerate = 
  (has_reference_image || has_confirmed_products) && 
  has_goal && 
  has_profile_type && 
  has_focus;
```

### 2.4 Onboarding Chips po koraku

**Cilj (goal):**
- "Više engagementa" → `cilj: engagement`
- "Izgradnja brenda" → `cilj: branding`
- "Promocija proizvoda" → `cilj: promotion`
- "Mix svega" → `cilj: mix`

**Tip profila (profile_type):**
- "🏷️ Product brand" → `profil: product_brand`
- "🌿 Lifestyle" → `profil: lifestyle`
- "👤 Creator" → `profil: creator`
- "📄 Content/Media" → `profil: content_media`

**Fokus (focus):**
- "📈 Engagement" → `fokus: engagement`
- "🚀 Rast" → `fokus: growth`
- "🛒 Promocija" → `fokus: promotion`
- "📖 Storytelling" → `fokus: storytelling`

---

## 3. REFERENCE IMAGE SUSTAV (NOVO - FAZA 3.4)

### 3.1 Tipovi referenci

| Tip | Label u DB | Svrha | Max |
|-----|-----------|-------|-----|
| **Style Reference** | `style_reference` | Vizualni stil, mood, kompozicija | 5 |
| **Product Reference** | `product_reference` | Slike proizvoda za AI | 5 |
| **Character Reference** | `character_reference` | Osobe/maskote za konzistentnost | 5 |

**Ukupni max:** 8 slika koristi se pri generiranju

### 3.2 Upload Flow

```
[UPLOAD_REFERENCE] ──► Korisnik odabire tip
        │
        ├──► "🎨 Stil reference" ──► [UPLOAD_STYLE_REFERENCE]
        │                                    │
        │                                    ▼
        │                           Prikaži file_upload chip
        │                           Korisnik uploada sliku
        │                           POST /api/assets/upload
        │                                    │
        │                                    ▼
        │                           Sprema se u MinIO
        │                           assets.label = 'style_reference'
        │
        ├──► "📦 Proizvodi" ──► [UPLOAD_PRODUCT_REFERENCE]
        │
        ├──► "👤 Likovi" ──► [UPLOAD_CHARACTER_REFERENCE]
        │
        └──► "Preskoči" ──► [ONBOARDING]
```

### 3.3 API Endpoints za Reference

```
POST /api/assets/upload
  Body: FormData { file, label: 'style_reference'|'product_reference'|'character_reference' }
  Returns: { id, url, label }

GET /api/assets/references
  Returns: { style_reference: [...], product_reference: [...], character_reference: [...] }

DELETE /api/assets/[id]
  Briše asset iz MinIO i DB
```

### 3.4 Database

```sql
-- Reference slike su assets s određenim labelom
assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  type TEXT,           -- 'image'
  label TEXT,          -- 'style_reference', 'product_reference', 'character_reference'
  url TEXT,
  ...
)
```

---

## 4. WEB SCRAPING SUSTAV (IMPLEMENTIRANO)

### 4.1 Instagram Scraping (Brzi pregled)

Korisnik može analizirati javni IG profil bez OAuth-a:

```typescript
// performScraping() u message/route.ts
1. Fetch Instagram profile HTML
2. Parse og:title, og:description meta tagove
3. Extract: full_name, bio, followers, posts_count
4. Fallback: estimateFromUsername() ako parsing ne uspije
```

**Rezultat:**
```
📊 **Profil @username**
👤 Full Name
👥 Pratitelji: 10.5K
📸 Objava: 150
📝 Bio text...

Želiš li nastaviti s ovim profilom?
[Da, nastavi] [Unesi web stranicu] [Spoji Instagram]
```

### 4.2 Website Scraping (NOVO)

Korisnik može unijeti URL web stranice za analizu:

```typescript
// scrapeWebsite() u message/route.ts
1. Fetch website HTML
2. Extract:
   - title (og:title ili <title>)
   - description (og:description ili meta description)
   - products/categories iz navigacije
   - dominant colors iz CSS i theme-color meta
```

**Rezultat:**
```
✅ **Web stranica analizirana!**
🌐 https://shop.example.hr/
📌 Title
📝 Description

🏷️ Pronađeni proizvodi/kategorije:
• Kategorija 1
• Kategorija 2

🎨 Dominantne boje: #ABC123, #DEF456
```

### 4.3 URL Parsing

```typescript
function extractWebsiteUrl(text: string): string | null {
  // Prvo traži kompletan URL s protokolom
  const fullUrlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i;
  
  // Fallback: URL bez protokola
  const simplePattern = /(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.)+[a-zA-Z]{2,}/i;
  
  // Dodaje https:// ako nedostaje
}
```

---

## 5. PROFILE PAGE (FAZA 4.0 - IMPLEMENTIRANO)

### 5.1 Ruta i navigacija

- **URL:** `/profile`
- **Navigacija:** Dodan link u layout.tsx između Calendar i Settings

### 5.2 Sekcije

| Sekcija | Editable | Opis |
|---------|----------|------|
| Header | - | Naslov, Save button, IG badge |
| Metadata Banner | - | Broj postova, verzija, timestamp, Rebuild button |
| Visual Style | ✅ | Boje, photography styles, lighting, mood, composition |
| Brand Consistency | ❌ | Color/style score, overall aesthetic |
| Caption Patterns | ❌ | Dužina, ton, emoji, hashtags |
| Products | ✅ | Lista proizvoda s lock/edit/delete |
| Content Themes | ✅ | Tag chips s add/remove |
| Reference Images | Preview | Thumbnails po tipu, link na chat |

### 5.3 API Endpoints

```
GET /api/profile
  Returns: {
    brand_profile: BrandProfile | null,
    instagram_connected: boolean,
    posts_analyzed: number,
    pending_products: number,
    confirmed_products: Product[],
    references: { style_reference: N, product_reference: N, character_reference: N },
    reference_images: { style_reference: [...], ... },
    last_rebuild: string | null
  }

PATCH /api/profile
  Body: { profile: BrandProfile }
  Ažurira brand_profiles.profile

POST /api/profile/rebuild
  Pokreće brandRebuild worker job

PATCH /api/products/[id]
  Body: { name?, category?, locked? }
  Ažurira proizvod

DELETE /api/products/[id]
  Briše proizvod
```

### 5.4 Locked Products

Kada je `product.locked = true`:
- brandRebuild processor ga NE modificira
- UI prikazuje 🔒 ikonu
- Korisnik može unlock-ati

### 5.5 Null Safety

Profile page ima defensive coding za sve sekcije:

```typescript
const meta = profile._metadata || {
  confidence_level: "auto",
  based_on_posts: 0,
  last_manual_override: null,
  auto_generated_at: new Date().toISOString(),
  version: 1
};

const visualStyle = profile.visual_style || {
  dominant_colors: [],
  photography_styles: [],
  lighting_preferences: [],
  mood: "professional",
  composition_patterns: []
};

// itd. za brand_consistency, caption_patterns, content_themes
```

### 5.6 UI Komponente

```
src/ui/ColorPicker.tsx   - Odabir boja s hex inputom
src/ui/MultiSelect.tsx   - Multi-select s chipovima
src/ui/ProgressBar.tsx   - Progress bar za scores
src/ui/ProductCard.tsx   - Kartica proizvoda s akcijama
```

---

## 6. INSTAGRAM FLOW (IMPLEMENTIRANO)

### 6.1 OAuth Flow

```
[Settings] ──► "Connect Instagram" ──► /api/instagram/login
                                            │
                                            ▼
                                    Meta OAuth Dialog
                                            │
                                            ▼
                                    /api/instagram/callback
                                            │
                                            ├──► Exchange code for token
                                            ├──► Get long-lived token (59 dana)
                                            ├──► Find IG Business Account via Page
                                            ├──► Update projects table
                                            ├──► Queue instagram.ingest job
                                            │
                                            ▼
                                    Redirect to /chat?ig_connected=1
```

### 6.2 Post-OAuth u Chatu

Kada korisnik dođe iz OAuth-a, chat prepoznaje query param i šalje poruku:
```
✅ Super! Instagram je uspješno povezan! 🎉
Pokrećem analizu tvojih objava u pozadini...

📊 Napredak: 1/5
✅ Vizualna referenca
⬜ Cilj
...

U međuvremenu, reci mi cilj tvog profila za idući mjesec:
[Engagement] [Branding] [Promocija] [Mix]
```

---

## 7. NOTIFIKACIJE SUSTAV (IMPLEMENTIRANO)

### 7.1 Arhitektura

```
[Worker] → pushNotification() → [chat_notifications table]
                                        ↓
[Frontend] ← polling (5s) ← [GET /api/chat/notifications]
                                        ↓
                              [Prikaz u chatu]
```

### 7.2 Tablica

```sql
CREATE TABLE chat_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id),
  project_id TEXT REFERENCES projects(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  chips JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.3 Korištenje

```typescript
import { notify } from "@/lib/notifications";

await notify.analysisComplete(project_id, { posts_analyzed, products_found, dominant_color });
await notify.planGenerated(project_id, itemCount, month);
await notify.jobFailed(project_id, jobName, error);
```

---

## 8. DATABASE SCHEMA

### 8.1 Core

```sql
projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  ig_connected BOOLEAN DEFAULT false,
  meta_access_token TEXT,        -- VAŽNO: NE ig_access_token!
  ig_user_id TEXT,
  ig_username TEXT,
  website_url TEXT,
  ...
)

brand_profiles (
  id TEXT PRIMARY KEY,
  project_id TEXT UNIQUE,
  profile JSONB,                 -- BrandProfile objekt
  updated_at TIMESTAMPTZ
)
```

### 8.2 Assets & Products

```sql
assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  type TEXT,                     -- 'image', 'video'
  label TEXT,                    -- 'style_reference', 'product_reference', 'character_reference', NULL
  url TEXT,
  meta JSONB,
  ...
)

detected_products (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  asset_id TEXT,
  product_name TEXT,
  category TEXT,
  visual_features JSONB,
  prominence TEXT,
  confidence NUMERIC,
  frequency INTEGER DEFAULT 1,
  status TEXT CHECK (status IN ('pending', 'confirmed', 'rejected')),
  locked BOOLEAN DEFAULT false,
  ...
)
```

### 8.3 Chat

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

chat_notifications (...)         -- Vidi sekciju 7.2
```

### 8.4 Content & RL

```sql
bandit_arms (
  id TEXT PRIMARY KEY,           -- VAŽNO: NE arm_id!
  name TEXT,
  params JSONB                   -- VAŽNO: NE arm_params!
)

content_items (
  id TEXT PRIMARY KEY,
  content_pack_id TEXT,
  project_id TEXT,
  day INTEGER,
  format TEXT,
  topic TEXT,
  visual_brief JSONB,
  caption JSONB,
  status TEXT,
  ...
)
```

---

## 9. WORKER ARHITEKTURA

### 9.1 Queues

| Queue | Job | Timeout | Opis |
|-------|-----|---------|------|
| `q_ingest` | `instagram.ingest` | 60s | Povlači media s IG |
| `q_analyze` | `analyze.instagram` | 90s | Vision API analiza |
| `q_brand_rebuild` | `brand.rebuild` | 60s | Agregira brand profil |
| `q_llm` | `plan.generate` | 120s | Generira content plan |
| `q_render` | `render.flux` | 60s | fal.ai render |
| `q_export` | `export.pack` | 60s | ZIP export |

### 9.2 Worker Config

```typescript
const baseWorkerConfig = {
  connection: { url: config.redisUrl },
  lockDuration: 60000,
  stalledInterval: 30000,
  maxStalledCount: 2
};

// Za LLM (spori API):
{ lockDuration: 120000 }

// Za Analyze:
{ lockDuration: 90000, concurrency: 3 }
```

---

## 10. KLJUČNI BUGOVI I RJEŠENJA (POVIJEST)

### V1 Fixes
- ✅ `planGenerate.ts` column error (`arm_id` → `id`)
- ✅ ChatChip icons (➕ prije, ✅ nakon potvrde)
- ✅ BullMQ lockDuration (30s → 60s+)
- ✅ Notification sustav implementiran
- ✅ Duplicate messages fix
- ✅ Infinite notifications fix
- ✅ Curly quotes syntax error

### V2 Fixes
- ✅ Redirect to /profile (404) → navigacija dodana
- ✅ Product confirmation u chatu
- ✅ pre_generate step
- ✅ Generation requirements check
- ✅ "Nova sesija" button

### V3 Fixes
- ✅ Duplicate product chips
- ✅ "Nastavi dalje" button
- ✅ Init step enforcement
- ✅ Synchronous scraping
- ✅ Generation requirements validation

### V4 Fixes
- ✅ Progress tracking (📊 Napredak: 3/5)
- ✅ Dynamic chip generation
- ✅ Full reset API
- ✅ "Bez Instagrama" flow
- ✅ Enhanced scraping s fallbacks

### V5 Fixes
- ✅ OAuth redirect loop fix
- ✅ Reset API column error (`ig_access_token` → `meta_access_token`)
- ✅ Reference image upload system

### V6 Fixes (Trenutna sesija)
- ✅ Upload reference loop - specifični handleri PRIJE općeg
- ✅ Web scraping za URL-ove
- ✅ URL parsing fix (cijeli URL s domenom)
- ✅ Profile page null safety (`_metadata`, `visual_style`, etc.)

---

## 11. HANDLER REDOSLIJED U MESSAGE ROUTE

**KRITIČNO:** Redoslijed handlera u `src/app/api/chat/message/route.ts` je bitan!

```typescript
// 1. GLOBALNI HANDLERI (hvataju iz bilo kojeg stepa)
if (norm.includes("spojen") && norm.includes("instagram")) { ... }  // IG connected
if (norm.startsWith("cilj:")) { ... }                                // Goal answer
if (norm.startsWith("profil:")) { ... }                              // Profile type
if (norm.startsWith("fokus:")) { ... }                               // Focus

// 2. GLOBALNE KOMANDE
if (norm.includes("prikaži") && norm.includes("proizvod")) { ... }
if (norm.includes("potvrdi sve")) { ... }
if (norm.includes("generiraj")) { ... }
if (norm.includes("pove") && norm.includes("insta")) { ... }
if (norm.includes("web") && norm.includes("stranic")) { ... }

// 3. SPECIFIČNI UPLOAD HANDLERI (PRIJE općeg!)
if (norm.includes("upload stil") || (step === "upload_reference" && norm.includes("stil"))) { ... }
if (norm.includes("upload proizvod") || (step === "upload_reference" && norm.includes("proizvod"))) { ... }
if (norm.includes("upload lik") || (step === "upload_reference" && norm.includes("lik"))) { ... }
if (norm.includes("preskoči")) { ... }

// 4. OPĆI UPLOAD HANDLER (NAKON specifičnih!)
if (norm.includes("uploaj") || (norm.includes("upload") && !specifični)) { ... }

// 5. STEP-SPECIFIČNI HANDLERI
if (step === "init") { ... }
if (step === "no_instagram_options") { ... }
if (step === "scrape_input") { ... }
if (step === "website_input") { ... }
if (step === "scrape_complete") { ... }
if (step === "onboarding") { ... }

// 6. DEFAULT
```

---

## 12. API ENDPOINTS - KOMPLETNA LISTA

### Chat
```
POST /api/chat/session          - Nova sesija
GET  /api/chat/session          - Učitaj sesiju
POST /api/chat/message          - Pošalji poruku (FSM)
GET  /api/chat/notifications    - Poll notifikacije
POST /api/chat/notifications    - Označi pročitano
POST /api/chat/reset            - Reset sesije i projekta
```

### Instagram
```
GET  /api/instagram/login       - OAuth start
GET  /api/instagram/callback    - OAuth callback
POST /api/instagram/scrape      - Web scraping profila
```

### Profile
```
GET   /api/profile              - Dohvati brand profil + metadata
PATCH /api/profile              - Ažuriraj brand profil
POST  /api/profile/rebuild      - Pokreni rebuild
```

### Products
```
GET    /api/products            - Lista proizvoda
POST   /api/products/confirm    - Potvrdi proizvod
POST   /api/products/reject     - Odbaci proizvod
PATCH  /api/products/[id]       - Update proizvod
DELETE /api/products/[id]       - Obriši proizvod
```

### Assets
```
POST   /api/assets/upload       - Upload slike (s labelom)
GET    /api/assets/references   - Dohvati reference images
DELETE /api/assets/[id]         - Obriši asset
```

### Content
```
GET   /api/content/latest       - Zadnji content pack
GET   /api/content/item         - Pojedinačni item
PATCH /api/content/item         - Update item
POST  /api/content/regenerate   - Regeneriraj
```

---

## 13. ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vissocial

# Redis (VAŽNO: port 6380!)
REDIS_URL=redis://localhost:6380

# Storage (MinIO)
S3_ENDPOINT=http://localhost:9100
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=vissocial

# AI
OPENAI_API_KEY=sk-...
FAL_KEY=...

# Instagram OAuth
META_APP_ID=...
META_APP_SECRET=...
APP_URL=https://your-ngrok-url.ngrok-free.dev

# Optional
ENABLE_INSTAGRAM_PUBLISH=false
DEV_GENERATE_LIMIT=3
```

---

## 14. CHECKLIST ZA DEVELOPMENT

Prije svakog odgovora:

- [ ] Koristi `project_knowledge_search` za provjeru koda
- [ ] Provjeri odgovara li database schema
- [ ] Generiraj KOMPLETNE datoteke, ne snippete
- [ ] Provjeri koristi li se URL (ne base64) za Vision API
- [ ] Provjeri koriste li se ispravna imena kolona (`id`/`params`, NE `arm_id`/`arm_params`)
- [ ] Redis port = **6380**
- [ ] Project ID = **"proj_local"**
- [ ] Token kolona = **meta_access_token** (NE ig_access_token)
- [ ] Handler redoslijed u message route (specifični PRIJE općih)

---

## 15. BUDUĆE FAZE (TODO)

### Kratkoročno
- [ ] File upload handling u chat UI (drag & drop)
- [ ] Toast notifikacije za upload success/error
- [ ] Thumbnail preview u chat bubbleu

### Srednjoročno
- [ ] Multi-image upload
- [ ] Image crop/resize prije uploada
- [ ] Reference image reordering (prioritet)

### Dugoročno
- [ ] Shopify integration
- [ ] Automatic scheduling
- [ ] A/B testing za content

---

**KRAJ DOKUMENTA**

*Ovaj dokument je autoritativan izvor znanja o Vissocial projektu.*
*Zadnje ažuriranje: Veljača 2026 - V6 fixes i Profile Page*
