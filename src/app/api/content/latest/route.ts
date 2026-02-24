import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getProjectId } from "@/lib/projectId";

export const dynamic = "force-dynamic";

// V9: PROJECT_ID removed — now uses getProjectId()
export async function GET() {
  const projectId = await getProjectId();
  const pack = (await q<any>(`SELECT * FROM content_packs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1`, [projectId]))[0] ?? null;
  if (!pack) return NextResponse.json({ pack: null, items: [] });
  const items = await q<any>(`
    SELECT ci.*, r.outputs AS latest_render
    FROM content_items ci
    LEFT JOIN LATERAL (
      SELECT outputs FROM renders WHERE content_item_id=ci.id AND status=$$succeeded$$ ORDER BY updated_at DESC LIMIT 1
    ) r ON true
    WHERE ci.content_pack_id=$1
    ORDER BY ci.day`, [pack.id]);
  return NextResponse.json({ pack, items });
}
