// ============================================================
// projectId.ts — Dynamic project ID from cookie
// ============================================================
// Replaces hardcoded "proj_local" with per-visitor project IDs.
// Each visitor gets a unique project_id stored in an httpOnly cookie.
// No auth required — just anonymous project isolation.
//
// Usage in API routes:
//   const projectId = await getProjectId();
//
// For OAuth flows (where cookie may not survive redirect):
//   Use readProjectId() + pass in state param
// ============================================================

import { cookies } from "next/headers";
import { q } from "./db";
import { log } from "./logger";

export const COOKIE_NAME = "vissocial_pid";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// ============================================================
// getProjectId — read cookie, create project if needed
// Use in all API route handlers (GET/POST/PATCH/DELETE)
// ============================================================
export async function getProjectId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME)?.value;

  if (existing) {
    // Verify project still exists in DB
    const rows = await q<any>(`SELECT id FROM projects WHERE id=$1`, [existing]);
    if (rows[0]) return existing;
    // Cookie has stale/deleted project ID — fall through to create new
    log("projectId", "stale cookie, creating new project", { stale: existing });
  }

  // Generate new project ID
  const projectId = "proj_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  await q(`INSERT INTO projects(id, name) VALUES ($1, $2)`, [projectId, "Project"]);
  await q(
    `INSERT INTO brand_profiles(project_id, language, profile) VALUES ($1, 'hr', '{}'::jsonb) ON CONFLICT DO NOTHING`,
    [projectId]
  );

  setProjectIdCookie(projectId);

  log("projectId", "new project created", { projectId });
  return projectId;
}

// ============================================================
// readProjectId — read-only, no creation
// Returns null if no cookie. Used for checking/OAuth state.
// ============================================================
export function readProjectId(): string | null {
  try {
    const cookieStore = cookies();
    return cookieStore.get(COOKIE_NAME)?.value || null;
  } catch {
    return null;
  }
}

// ============================================================
// setProjectIdCookie — set/overwrite the cookie
// Used by: getProjectId (auto), reset endpoint (manual)
// ============================================================
export function setProjectIdCookie(projectId: string) {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, projectId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

// ============================================================
// ensureProject — make sure project + brand_profile exist
// Called when creating from cookie or from reset
// ============================================================
export async function ensureProject(projectId: string) {
  const rows = await q<any>(`SELECT id, ig_connected FROM projects WHERE id=$1`, [projectId]);
  if (rows[0]) return rows[0];

  await q(`INSERT INTO projects(id, name) VALUES ($1, $2)`, [projectId, "Project"]);
  await q(
    `INSERT INTO brand_profiles(project_id, language, profile) VALUES ($1, 'hr', '{}'::jsonb) ON CONFLICT DO NOTHING`,
    [projectId]
  );

  return { id: projectId, ig_connected: false };
}
