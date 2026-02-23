// ============================================================
// logger.ts — Centralized logging
// ============================================================
// PRODUCTION FIX: Always log in production!
// APP_DEBUG controls verbose logging in development only.
// In production (NODE_ENV=production), ALL logs are emitted.
// ============================================================

const IS_PRODUCTION = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
const DEBUG = process.env.APP_DEBUG === "true";

export function log(scope: string, msg: string, extra?: any) {
  // ALWAYS log in production, or when APP_DEBUG is true in dev
  if (!IS_PRODUCTION && !DEBUG) return;

  const entry: Record<string, any> = {
    ts: new Date().toISOString(),
    scope,
    msg,
  };

  if (extra !== undefined) {
    // Truncate large objects to avoid flooding logs
    try {
      const serialized = JSON.stringify(extra);
      entry.extra = serialized.length > 2000
        ? JSON.parse(serialized.substring(0, 2000) + '..."}}')
        : extra;
    } catch {
      entry.extra = { _serialize_error: true, type: typeof extra };
    }
  }

  console.log(JSON.stringify(entry));
}

// ============================================================
// Error-specific logger (always includes stack trace)
// ============================================================

export function logError(scope: string, msg: string, error: any, extra?: any) {
  const entry: Record<string, any> = {
    ts: new Date().toISOString(),
    level: "ERROR",
    scope,
    msg,
    error: {
      message: error?.message || String(error),
      stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
      name: error?.name,
    },
  };

  if (extra !== undefined) {
    entry.extra = extra;
  }

  console.error(JSON.stringify(entry));
}
