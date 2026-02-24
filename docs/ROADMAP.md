# Vissocial — Roadmap

> Zadnje ažuriranje: 24. veljače 2026

## ✅ Completed

### Phase 1: Foundation (V1)
- [x] Next.js 14 + TypeScript setup
- [x] PostgreSQL + BullMQ + Redis
- [x] Instagram OAuth (Meta Graph API)
- [x] Chat FSM (init → onboarding → generation)
- [x] Vision API analysis pipeline
- [x] fal.ai image generation (Flux2)
- [x] Calendar UI

### Phase 2: Notifications & Content (V2)
- [x] Async notification system (polling)
- [x] ChatChip component with icons
- [x] Content plan generation (Thompson sampling)
- [x] Export (ZIP with CSV + media)

### Phase 3: Design System (V3)
- [x] Contently-style UI migration
- [x] ChatBubble, ChatLayout, AppHeader components
- [x] Profile Analysis page (/analyze/[handle])
- [x] Dual-layer navigation
- [x] Lavender gradient, AI sparkle avatar
- [x] Progressive loading animations

### Phase 4: Pipeline Fixes (V7)
- [x] Product confirm visual feedback (green checkmark)
- [x] Database: assets.external_id column
- [x] Database: detected_products.analysis_id + source
- [x] Storage: Vercel Blob allowOverwrite fix
- [x] Init step simplification (2 options only)

### Phase 5: Production Deployment (V8) — Feb 24, 2026
- [x] Vercel (frontend) + Railway (worker) deployment
- [x] Neon PostgreSQL with SSL configuration
- [x] Database SSL fix (db.ts — sslmode=require)
- [x] fal.ai image_urls limit fix (max 4 references)
- [x] Vercel API caching fix (force-dynamic on content/latest)
- [x] Storage URL fix (uploadedUrl instead of s3Key for Vercel Blob)
- [x] APP_URL trailing slash/newline fix
- [x] BLOB_READ_WRITE_TOKEN on Railway
- [x] Missing production DB columns (chat_notifications.project_id, instagram_analyses.created_at/project_id)
- [x] Redis connection monitoring (ioredis)
- [x] BullMQ render lock duration (180s for fal.ai)
- [x] Debug endpoints (pipeline-status, clean-failed, clean-old-packs)
- [x] Health check endpoint (/health)
- [x] Worker logging enabled in production
- [x] Full pipeline verified: OAuth → Ingest → Analyze → Brand Rebuild → Notification → Plan → Render → Calendar

## 🔄 In Progress

### Production Stabilization
- [ ] DEV_GENERATE_LIMIT reliable enforcement
- [ ] Database migration system (replace manual ALTER TABLE)
- [ ] Production monitoring & alerting
- [ ] BLOB_READ_WRITE_TOKEN rotation (token shared in chat — needs rotation)

### Brand Profile & Products
- [ ] /profile stranica s brand editing
- [ ] Visual style editing
- [ ] Product management (add/remove/edit)
- [ ] Brand consistency metrics prikaz

## 📋 Planned

### Phase 6: Publishing
- [ ] Real posting scheduler UI
- [ ] Queue status dashboard
- [ ] Retry failed posts
- [ ] S3 signed URLs za export

### Phase 7: Multi-platform
- [ ] Platform abstraction layer
- [ ] TikTok integration
- [ ] Facebook Page posting
- [ ] LinkedIn (later)

### Phase 8: Video
- [ ] video.generate queue
- [ ] Luma/Runway adapters
- [ ] Image-to-motion
- [ ] Captions overlay

### Phase 9: Enterprise
- [ ] Multi-tenant auth
- [ ] LoRA training pipeline
- [ ] Brand safety rules
- [ ] Logo protection
- [ ] Shopify integration

## Known Issues

### Resolved (V8 — Production)
- ~~SSL connection error on Neon~~ → Fixed (db.ts SSL config)
- ~~fal.ai 422: image_urls > 4~~ → Fixed (prioritizeRefs with cap)
- ~~Calendar empty despite renders~~ → Fixed (force-dynamic)
- ~~Vision API invalid_image_url~~ → Fixed (use uploadedUrl not s3Key)
- ~~APP_URL newline in Railway~~ → Fixed (cleaned variable)
- ~~BLOB_READ_WRITE_TOKEN missing on Railway~~ → Fixed (added to variables)
- ~~chat_notifications.project_id missing~~ → Fixed (ALTER TABLE)
- ~~instagram_analyses.created_at/project_id missing~~ → Fixed (ALTER TABLE)

### Resolved (V7)
- ~~planGenerate.ts column error~~ → Fixed (arm_id → id)
- ~~ChatChip icons~~ → Fixed (☐ before, ✅ after)
- ~~Product confirm no feedback~~ → Fixed (zeleni chip)
- ~~Vercel Blob re-ingest~~ → Fixed (allowOverwrite)
- ~~assets.external_id missing~~ → Fixed (ALTER TABLE)
- ~~detected_products.analysis_id missing~~ → Fixed (ALTER TABLE)

### Open — Medium
1. **DEV_GENERATE_LIMIT** — Set to 3 in Railway but may not take effect reliably
   - Config reads from env but worker may cache old value
2. **Redis ECONNRESET** — Railway Redis proxy occasionally drops connections
   - Worker auto-reconnects, not critical but noisy in logs

### Open — Low
1. **Badge komponenta** — ne postoji u novom design sistemu
2. **scrape_input/scrape_complete stepovi** — postoje u kodu ali se ne nude iz init-a

## Deployment Architecture

| Component | Platform | Auto-deploy |
|-----------|----------|-------------|
| Frontend (Next.js) | Vercel | ✅ GitHub main |
| Worker (BullMQ) | Railway | ✅ GitHub main |
| Database | Neon | N/A |
| Redis | Railway | N/A |
| Storage | Vercel Blob | N/A |
| Image Gen | fal.ai | N/A |

## Version History

| Version | Datum | Highlights |
|---------|-------|------------|
| V1 | Jan 2026 | Foundation, Instagram OAuth, Vision |
| V2 | Jan 2026 | Content generation, Calendar, Notifications |
| V3 | Feb 7, 2026 | Design system migration, Profile Analysis |
| V7 | Feb 7, 2026 | Database fixes, Product confirm UI |
| V8 | Feb 24, 2026 | **Production deployment**, SSL, Storage URL, fal.ai limit |
