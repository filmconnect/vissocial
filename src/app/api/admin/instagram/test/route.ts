import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { graphGET } from "@/lib/instagram";

const PROJECT_ID = "proj_local";

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  const rows = await q(
    `SELECT meta_access_token, meta_token_expires_at FROM projects WHERE id=$1`,
    [PROJECT_ID]
  );

  const token = rows?.[0]?.meta_access_token;
  if (!token) {
    return NextResponse.json({ error: "No IG token" }, { status: 400 });
  }

  const me = await graphGET("/me", token, {
    fields: "id,username,account_type"
  });

  const media = await graphGET(`/${me.id}/media`, token, {
    fields: "id,media_type,caption,timestamp",
    limit: "3"
  });

  return NextResponse.json({
    ok: true,
    token_expires_at: rows[0].meta_token_expires_at,
    me,
    media
  });
}
