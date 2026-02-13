// ============================================================
// config.ts — Centralized configuration
// ============================================================
// V8: Added separate fal.ai model configs for text-to-image vs edit
// ============================================================

export const config = {
  appUrl: process.env.APP_URL || "https://aerologic-unobstruently-mellissa.ngrok-free.dev/",
  dbUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  openaiKey: process.env.OPENAI_API_KEY!,
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  falKey: process.env.FAL_KEY!,

  // ============================================================
  // FAL.AI Model Configuration
  // ============================================================
  // Text-to-image (no reference images) — used when no refs uploaded
  falFluxModel: process.env.FAL_FLUX_MODEL || "flux/dev",

  // Image editing with references — used when product/style/character refs exist
  // Supports multi-reference, @image indexing, HEX colors
  falFluxEditModel: process.env.FAL_FLUX_EDIT_MODEL || "flux-2/edit",

  policyUrl: process.env.POLICY_URL || "http://localhost:8010",
  enableInstagramPublish: (process.env.ENABLE_INSTAGRAM_PUBLISH || "false") === "true",
  meta: {
    appId: process.env.META_APP_ID!,
    appSecret: process.env.META_APP_SECRET!,
    version: process.env.META_GRAPH_VERSION || "v23.0",
    redirectUri: process.env.META_REDIRECT_URI || "https://aerologic-unobstruently-mellissa.ngrok-free.dev/api/instagram/callback",
    scopes: process.env.META_SCOPES || "instagram_business_basic, instagram_business_content_publish, instagram_business_manage_comments,instagram_business_manage_messages"
  },
  dev: {
    generateLimit: Number(process.env.DEV_GENERATE_LIMIT || 30),
    allowLimitOverride: (process.env.DEV_ALLOW_LIMIT_OVERRIDE || "false") === "true"
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION || "us-east-1",
    bucket: process.env.S3_BUCKET!,
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!,
    publicBase: process.env.S3_PUBLIC_BASE!
  }
};
