// ============================================================
// API: /api/projects/me
// ============================================================
// Returns the current user's project.
// V9: Dynamic project_id from cookie
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getProjectId, ensureProject } from "@/lib/projectId";

export async function GET() {
  const projectId = await getProjectId();
  await ensureProject(projectId);

  // Fetch full project data
  const rows = await q<any>(`SELECT * FROM projects WHERE id=$1`, [projectId]);
  return NextResponse.json({ project: rows[0] });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const projectId = await getProjectId();
  await ensureProject(projectId);

  if (typeof body.ig_publish_enabled === "boolean") {
    await q(
      `UPDATE projects SET ig_publish_enabled=$1, updated_at=now() WHERE id=$2`,
      [body.ig_publish_enabled, projectId]
    );
  }

  const rows = await q<any>(`SELECT * FROM projects WHERE id=$1`, [projectId]);
  return NextResponse.json({ project: rows[0] });
}
