export const config = {
  appUrl: process.env.APP_URL || "http://localhost:3000",
  dbUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  openaiKey: process.env.OPENAI_API_KEY!,
  openaiModel: process.env.OPENAI_MODEL || "gpt-5-mini",
  falKey: process.env.FAL_KEY!,
  falFluxModel: process.env.FAL_FLUX_MODEL || "flux-pro",
  policyUrl: process.env.POLICY_URL || "http://localhost:8010",
  enableInstagramPublish: (process.env.ENABLE_INSTAGRAM_PUBLISH || "false") === "true",
  meta: {
    appId: process.env.META_APP_ID!,
    appSecret: process.env.META_APP_SECRET!,
    version: process.env.META_GRAPH_VERSION || "v23.0",
    redirectUri: process.env.META_REDIRECT_URI || "http://localhost:3000/api/instagram/callback",
    scopes: process.env.META_SCOPES || "instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement"
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
