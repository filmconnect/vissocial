const DEBUG = process.env.APP_DEBUG === "true";

export function log(scope: string, msg: string, extra?: any) {
  if (!DEBUG) return;

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    scope,
    msg,
    extra
  }));
}
