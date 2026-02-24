// ============================================================
// API: /api/chat/reset
// ============================================================
// "Nova sesija" — creates a completely new project.
// Old project stays in DB untouched (user just can't see it).
// New cookie → new project → clean slate.
//
// V9: Dynamic project_id — no more proj_local
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { setProjectIdCookie } from "@/lib/projectId";

export async function POST() {
  try {
    // 1. Generate new project
    const projectId = "proj_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    await q(`INSERT INTO projects(id, name) VALUES ($1, $2)`, [projectId, "Project"]);
    await q(
      `INSERT INTO brand_profiles(project_id, language, profile) VALUES ($1, 'hr', '{}'::jsonb) ON CONFLICT DO NOTHING`,
      [projectId]
    );

    log("api:chat:reset", "new project created", { project_id: projectId });

    // 2. Set new cookie (overwrites old project_id)
    setProjectIdCookie(projectId);

    // 3. Create new chat session
    const id = "chat_" + uuid();
    const initialStep = "init";

    await q(
      `INSERT INTO chat_sessions(id, project_id, state) VALUES ($1,$2,$3)`,
      [id, projectId, JSON.stringify({ step: initialStep })]
    );

    // 4. Create welcome message
    const m1 = "msg_" + uuid();
    const welcomeText = `Bok! 👋 Ja sam Vissocial, tvoj AI asistent za Instagram sadržaj.

Kako želiš započeti?

1. **Spoji Instagram** - povezivanje za punu funkcionalnost
2. **Nastavi bez Instagrama** - ručni upload slika`;

    // V9 FIX: navigation type za Spoji Instagram
    const chips = [
      { type: "navigation", label: "Spoji Instagram", href: "/settings" },
      { type: "onboarding_option", label: "Nastavi bez Instagrama", value: "nastavi bez" }
    ];

    await q(
      `INSERT INTO chat_messages(id, session_id, role, text, meta) VALUES ($1,$2,'assistant',$3,$4)`,
      [m1, id, welcomeText, JSON.stringify({ chips })]
    );

    log("api:chat:reset", "new session created", { session_id: id, project_id: projectId });

    // 5. Get messages for response
    const messages = await q<any>(
      `SELECT id, role, text, meta FROM chat_messages WHERE session_id=$1 ORDER BY created_at`,
      [id]
    );

    const mapped = messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      chips: m.meta?.chips
    }));

    return NextResponse.json({
      ok: true,
      session_id: id,
      messages: mapped,
      ig_connected: false,
      step: initialStep,
      project_id: projectId,
      reset: {
        type: "new_project",
        old_project: "preserved"
      }
    });

  } catch (error: any) {
    log("api:chat:reset", "error", { error: error.message });
    return NextResponse.json(
      { error: "Failed to reset session: " + error.message },
      { status: 500 }
    );
  }
}
