# Vissocial (Next.js + Postgres + BullMQ + fal.ai + Instagram Graph API + Policy RL)

This repo is a **chat-first** Instagram content generator:
- Connect Instagram (OAuth)
- Chat onboarding + goal capture
- Product detection (IG + optional website crawl placeholder)
- Monthly plan generation (ChatGPT) + visual blueprints
- Flux2 renders via fal.ai (+ multi-reference)
- Calendar/editor (approve, schedule, regen per post)
- Free vs Pro (watermark, month regen lock)
- Export CSV+ZIP
- **Closed RL loop**: ingest IG metrics → compute reward → update Thompson bandit policy

## Run (local)
```bash
docker compose up -d
cp .env.example .env
npm i
npm run migrate
npm run dev
npm run worker
```

## Notes
- Real Instagram publishing requires a Business/Creator account linked properly and correct permissions. See Meta docs:
  - Content Publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/  citeturn0search0
  - Media insights: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/ citeturn0search2
- Toggle publishing with `ENABLE_INSTAGRAM_PUBLISH`.
- In dev, you can limit generation count with `DEV_GENERATE_LIMIT`.

## What’s implemented
See `docs/FEATURES.md` and `docs/ROADMAP.md`.

