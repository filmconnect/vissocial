# Roadmap

> **Zadnje ažuriranje:** 7. veljače 2026

## ✅ Completed

### Phase 0: Foundation
- [x] Database schema (projects, assets, products, content)
- [x] BullMQ queue setup
- [x] MinIO storage integration
- [x] Basic chat UI

### Phase 1: Instagram + Vision
- [x] Instagram OAuth flow
- [x] Media ingest (25 posts)
- [x] GPT-4 Vision analysis
- [x] Product detection
- [x] Brand profile aggregation
- [x] Base64 encoding for dev (ngrok timeout fix)

### Phase 2: Content Generation
- [x] ChatGPT content planning
- [x] Flux2 image rendering (fal.ai)
- [x] Multi-reference support
- [x] Calendar/editor UI

### Phase 3: Chat UX
- [x] Async notifications system
- [x] chat_notifications table
- [x] Frontend polling (5s)
- [x] Worker lockDuration fix
- [x] ChatChip icons (☐ before, ✅ after) — V7
- [x] Product confirm vizualni feedback — V7
- [x] Init step simplifikacija (2 opcije) — V7

### Phase 3.5: Design System Migration (V3 — NOVO)
- [x] Design tokens (boje, fontovi, spacing)
- [x] UI komponente (ChatBubble, ChatLayout, Button, Card, Chip, Avatar, Icons, Input)
- [x] Lavender gradient pozadina
- [x] AI avatar (sparkle, NE robot)
- [x] Contently-style landing page
- [x] Dvoslojna navigacija (ChatLayout + AppHeader)
- [x] Tailwind custom classes i boje

### Phase 3.6: Profile Analysis (V3 — NOVO)
- [x] /analyze/[handle] stranica
- [x] POST /api/analyze endpoint (scrape + GPT-4o-mini)
- [x] Progressive loading (skeleton states)
- [x] Error handling (timeout, network, not_found)
- [x] from=analyze → /chat integration
- [x] localStorage bridge za kontekst passing

### Phase 3.7: Database & Storage Fixes (V7)
- [x] assets.external_id kolona (duplicate detection)
- [x] detected_products.analysis_id + source kolone
- [x] Vercel Blob allowOverwrite: true (re-ingest fix)
- [x] End-to-end pipeline verificiran

## 🚧 In Progress

### Phase 4: Polish & Cleanup
- [ ] Error handling poboljšanja na svim stranicama
- [ ] Toast notifikacije za upload success/error
- [ ] Step indicator dinamičko ažuriranje
- [ ] Cleanup: obrisati Card.tsx, Badge.tsx ako se ne koriste
- [ ] Cleanup: obrisati ChipButton iz page.tsx

### Phase 4.5: Profile Screen Enhancement
- [ ] /profile stranica s brand editing
- [ ] Visual style editing
- [ ] Product management (add/remove/edit)
- [ ] Brand consistency metrics prikaz

## 📋 Planned

### Phase 5: Publishing
- [ ] Real posting scheduler UI
- [ ] Queue status dashboard
- [ ] Retry failed posts
- [ ] S3 signed URLs za export

### Phase 6: Multi-platform
- [ ] Platform abstraction layer
- [ ] TikTok integration
- [ ] Facebook Page posting
- [ ] LinkedIn (later)

### Phase 7: Video
- [ ] video.generate queue
- [ ] Luma/Runway adapters
- [ ] Image-to-motion
- [ ] Captions overlay

### Phase 8: Enterprise
- [ ] Multi-tenant auth
- [ ] LoRA training pipeline
- [ ] Brand safety rules
- [ ] Logo protection

## Known Issues

### Resolved (V7)
- ~~planGenerate.ts column error~~ → Fixed (arm_id → id)
- ~~ChatChip icons~~ → Fixed (☐ before, ✅ after)
- ~~Product confirm no feedback~~ → Fixed (zeleni chip)
- ~~Vercel Blob re-ingest~~ → Fixed (allowOverwrite)
- ~~assets.external_id missing~~ → Fixed (ALTER TABLE)
- ~~detected_products.analysis_id missing~~ → Fixed (ALTER TABLE)

### Open — Medium
1. **Notifications table** — `column "title" does not exist` na nekim upitima
   - Database schema mismatch, treba ALTER TABLE

### Open — Low
1. **Badge komponenta** — ne postoji u novom design sistemu
   - Stranice koje koriste Badge trebaju migraciju na inline span
2. **scrape_input/scrape_complete stepovi** — postoje u kodu ali se ne nude iz init-a
   - Kandidat za cleanup u budućoj sesiji

## Branch Strategy

| Branch | Status | Opis |
|--------|--------|------|
| `main` | Stabilno | Production-ready kod |
| `develop` | Development | Integration branch |
| `feature/design_initial` | **Aktivni** | V3 Design System + V7 Fixes |

## Version History

| Version | Datum | Highlights |
|---------|-------|------------|
| V1 | Jan 2026 | Foundation, Instagram OAuth, Vision |
| V2 | Jan 2026 | Content generation, Calendar, Notifications |
| V3 | Feb 2026 | Design system migration, Profile Analysis |
| V7 Fixes | Feb 2026 | Database fixes, Product confirm UI, Pipeline verification |
