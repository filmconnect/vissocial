# Features (implemented)

## Chat-first UX
- `/chat` is the main UI.
- Onboarding runs as a finite-state chat (goal → planned posts → profile type confirm → focus → horizon).
- Commands in chat:
  - `generiraj plan` → plan + renders queued
  - `poveži instagram` → points to Settings
  - `metrics` / `insights` → metrics ingest job

## Instagram
- OAuth login + token exchange
- Discovers connected Instagram professional account via Page
- Ingests last 25 media items and stores them in S3-compatible storage
- Publishing:
  - toggled by `ENABLE_INSTAGRAM_PUBLISH` + per-project `ig_publish_enabled`
  - publishes latest rendered image via /media + /media_publish

## Generation
- ChatGPT generates: topic, captions, visual_direction (scene + negatives + on-screen text)
- Flux2 via fal.ai renders previews
- Multi-reference: upload refs labeled `style_reference`, `product_reference`, `character_reference` (up to 8 used)

## Calendar/editor
- View monthly items, preview thumbnails
- Edit caption, approve, schedule, regenerate, publish now

## Export
- CSV + ZIP with caption.txt and media when available

## RL loop (closed)
- Thompson sampling policy service (FastAPI)
- `bandit_arms` seeded in DB
- Plan generation calls policy choose per slot
- After publishing, metrics jobs are scheduled (1h/24h/7d) to:
  - pull insights
  - compute reward_01
  - call policy/update

