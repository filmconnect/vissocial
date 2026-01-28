import { config } from "./config";

export function isAdmin(req: Request) {
  const secret =
    req.headers.get("x-admin-secret") ||
    new URL(req.url).searchParams.get("admin");

  return secret === process.env.ADMIN_SECRET;
}
