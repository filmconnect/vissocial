import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";

const PROJECT_ID = "proj_local";

async function ensureProject() {
  const rows = await q<any>(`SELECT id FROM projects WHERE id=$1`, [PROJECT_ID]);
  if (!rows[0]) {
    await q(`INSERT INTO projects(id, name) VALUES ($1,'Local Project')`, [PROJECT_ID]);
    await q(`INSERT INTO brand_profiles(project_id, language, profile) VALUES ($1,'hr','{}'::jsonb) ON CONFLICT DO NOTHING`, [PROJECT_ID]);
  }
}

export async function POST() {
  await ensureProject();
  const id = "chat_" + uuid();
  log("api:chat", "new session created", { session_id: id });
  await q(`INSERT INTO chat_sessions(id, project_id, state) VALUES ($1,$2,$3)`, [id, PROJECT_ID, JSON.stringify({ step: "welcome" })]);

  const m1 = "msg_" + uuid();
  const txt = "Bok! 😊 Ja sam Vissocial. Krenimo brzo.\n\n1) Poveži Instagram u Settings (ako već nisi).\n2) Reci mi cilj profila za idući mjesec.";
  await q(`INSERT INTO chat_messages(id, session_id, role, text, meta) VALUES ($1,$2,'assistant',$3,$4)`,
    [m1, id, txt, JSON.stringify({ chips: ["Više engagementa","Izgradnja brenda","Promocija proizvoda","Mix"] })]);

  const messages = await q<any>(`SELECT id, role, text, meta FROM chat_messages WHERE session_id=$1 ORDER BY created_at`, [id]);
  const mapped = messages.map(m=>({ id:m.id, role:m.role, text:m.text, chips: m.meta?.chips }));
  return NextResponse.json({ session_id: id, messages: mapped });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const session_id = url.searchParams.get("session_id");
  if (!session_id) return NextResponse.json({ error: "session_id required" }, { status: 400 });
  const messages = await q<any>(`SELECT id, role, text, meta FROM chat_messages WHERE session_id=$1 ORDER BY created_at`, [session_id]);
  const mapped = messages.map(m=>({ id:m.id, role:m.role, text:m.text, chips: m.meta?.chips }));
  return NextResponse.json({ session_id, messages: mapped });
}
