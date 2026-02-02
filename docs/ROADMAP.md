# Roadmap

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

### Phase 3: Chat UX (Partial)
- [x] Async notifications system
- [x] chat_notifications table
- [x] Frontend polling (5s)
- [x] Worker lockDuration fix
- [ ] ChatChip icons (plus → check)
- [ ] planGenerate bug fix

## 🚧 In Progress

### Phase 3: Chat UX (Continued)
- [ ] Fix planGenerate arm_id bug
- [ ] ChatChip icon states (➕ before, ✅ after)
- [ ] Instagram scraping without OAuth
- [ ] Post-OAuth chat notification

### Phase 4: Web Scraping
- [ ] Public Instagram profile scraping
- [ ] Company website scraping
- [ ] Quick brand analysis without OAuth
- [ ] Product catalog extraction

## 📋 Planned

### Phase 5: Publishing
- [ ] Real posting scheduler UI
- [ ] Queue status dashboard
- [ ] Retry failed posts
- [ ] S3 signed URLs for export

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

### Critical
1. **planGenerate.ts:53** - `column "arm_id" does not exist`
   - Table has `id, params` not `arm_id, arm_params`
   - All references need updating

### Medium
2. **ChatChip icons** - Shows ✅ before and after confirmation
   - Should show ➕ before, ✅ after

### Low
3. **Post-OAuth message** - No chat message after Instagram OAuth
   - May be localStorage issue
