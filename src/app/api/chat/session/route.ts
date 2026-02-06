// ============================================================
// API: /api/chat/session
// ============================================================
// Kreira ili učitava chat session.
// UPDATED: Dodana podrška za Step 0 (init) state.
// UPDATED: Maknuta opcija "Brzi pregled" - samo Spoji IG + Nastavi bez
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

// ============================================================
// Ensure project exists
// ============================================================
async function ensureProject() {
  const rows = await q<any>(`SELECT id, ig_connected FROM projects WHERE id=$1`, [PROJECT_ID]);
  if (!rows[0]) {
    await q(`INSERT INTO projects(id, name) VALUES ($1,'Local Project')`, [PROJECT_ID]);
    await q(`INSERT INTO brand_profiles(project_id, language, profile) VALUES ($1,'hr','{}'::jsonb) ON CONFLICT DO NOTHING`, [PROJECT_ID]);
    return { id: PROJECT_ID, ig_connected: false };
  }
  return rows[0];
}

// ============================================================
// POST /api/chat/session
// Kreira novu session
// ============================================================
export async function POST() {
  try {
    const project = await ensureProject();
    const id = "chat_" + uuid();

    // UVIJEK počni s init stepom - korisnik bira što želi
    // Čak i ako je IG spojen, prikaži opcije
    const initialStep = "init";

    log("api:chat:session", "new session created", {
      session_id: id,
      initial_step: initialStep,
      ig_connected: project.ig_connected
    });

    await q(
      `INSERT INTO chat_sessions(id, project_id, state) VALUES ($1,$2,$3)`,
      [id, PROJECT_ID, JSON.stringify({ step: initialStep })]
    );

    // Initial message depends on state
    const m1 = "msg_" + uuid();
    let welcomeText: string;
    let chips: any[];

    if (initialStep === "init") {
      // Step 0: Pre-OAuth, offer options
      welcomeText = `Bok! 👋 Ja sam Vissocial, tvoj AI asistent za Instagram sadržaj.

Kako želiš započeti?

1. **Spoji Instagram** - povezivanje za punu funkcionalnost
2. **Nastavi bez Instagrama** - ručni upload slika`;

      chips = [
        { type: "suggestion", label: "Spoji Instagram", value: "spoji instagram" },
        { type: "suggestion", label: "Nastavi bez Instagrama", value: "nastavi bez" }
      ];
    } else {
      // Post-OAuth welcome
      welcomeText = `Bok! 😊 Ja sam Vissocial. Instagram je već spojen!

Reci mi cilj tvog profila za idući mjesec, pa krećemo s planom.`;

      chips = [
        { type: "onboarding_option", label: "Više engagementa", value: "cilj: engagement" },
        { type: "onboarding_option", label: "Izgradnja brenda", value: "cilj: branding" },
        { type: "onboarding_option", label: "Promocija proizvoda", value: "cilj: promotion" },
        { type: "onboarding_option", label: "Mix svega", value: "cilj: mix" }
      ];
    }

    await q(
      `INSERT INTO chat_messages(id, session_id, role, text, meta) VALUES ($1,$2,'assistant',$3,$4)`,
      [m1, id, welcomeText, JSON.stringify({ chips })]
    );

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
      session_id: id,
      messages: mapped,
      ig_connected: project.ig_connected,
      step: initialStep
    });

  } catch (error: any) {
    log("api:chat:session", "error creating session", { error: error.message });
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

// ============================================================
// GET /api/chat/session
// Učitava postojeću session
// ============================================================
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session_id = url.searchParams.get("session_id");

  if (!session_id) {
    return NextResponse.json(
      { error: "session_id required" },
      { status: 400 }
    );
  }

  try {
    // Get session with state
    const session = await q<any>(
      `SELECT cs.id, cs.state, p.ig_connected
       FROM chat_sessions cs
       JOIN projects p ON p.id = cs.project_id
       WHERE cs.id = $1`,
      [session_id]
    );

    if (!session[0]) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get messages
    const messages = await q<any>(
      `SELECT id, role, text, meta FROM chat_messages WHERE session_id=$1 ORDER BY created_at`,
      [session_id]
    );

    const mapped = messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      chips: m.meta?.chips
    }));

    const state = session[0].state || {};

    return NextResponse.json({
      session_id,
      messages: mapped,
      ig_connected: session[0].ig_connected,
      step: state.step || "init"
    });

  } catch (error: any) {
    log("api:chat:session", "error loading session", {
      session_id,
      error: error.message
    });
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}
