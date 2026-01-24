# Roadmap (already scaffolded)

## Next
- Proper auth & multi-tenant (users/projects)
- Product detection:
  - IG: detect products from captions + OCR on images
  - Web crawl fallback for product library extraction
- Real posting scheduler UI with queue status
- Replace data-url export with S3 upload + signed link

## Video
- Add `video.generate` queue (Luma / Runway adapters)
- Motion templates for Reels: image-to-motion + captions overlay

## Multi-platform
- Abstractions in `src/platforms/*`:
  - Instagram (done)
  - TikTok (planned)
  - Facebook Page posting (planned)
  - LinkedIn (later)

## Enterprise
- LoRA training pipeline for product/character
- Brand safety rules + logo protection pipeline

