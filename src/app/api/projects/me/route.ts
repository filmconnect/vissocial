import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";

const PROJECT_ID = "proj_local";

async function ensureProject() {
  const rows = await q<any>(`SELECT * FROM projects WHERE id=$1`, [PROJECT_ID]);
  if (rows[0]) return rows[0];
  await q(`INSERT INTO projects(id, name) VALUES ($1,$2)`, [PROJECT_ID, "Local Project"]);
  await q(`INSERT INTO brand_profiles(project_id, language, profile) VALUES ($1,'hr','{}'::jsonb) ON CONFLICT DO NOTHING`, [PROJECT_ID]);
  return (await q<any>(`SELECT * FROM projects WHERE id=$1`, [PROJECT_ID]))[0];
}

export async function GET() {
  const project = await ensureProject();
  return NextResponse.json({ project });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  await ensureProject();
  if (typeof body.ig_publish_enabled === "boolean") {
    await q(`UPDATE projects SET ig_publish_enabled=$1, updated_at=now() WHERE id=$2`, [body.ig_publish_enabled, PROJECT_ID]);
  }
  const project = (await q<any>(`SELECT * FROM projects WHERE id=$1`, [PROJECT_ID]))[0];
  return NextResponse.json({ project });
}
