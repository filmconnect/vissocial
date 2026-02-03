// ============================================================
// API: /api/chat/reset
// ============================================================
// Resetira sve i kreće ispočetka:
// - Odspaja Instagram
// - Briše proizvode
// - Briše stare sesije
// - Kreira novu sesiju
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

export async function POST() {
  try {
    log("api:chat:reset", "starting reset", { project_id: PROJECT_ID });

    // 1. Disconnect Instagram - only reset flags, NOT the token
    // (token ostaje za slučaj da korisnik želi ponovno spojiti)
    await q(
      `UPDATE projects SET ig_connected = false WHERE id = $1`,
      [PROJECT_ID]
    );
    log("api:chat:reset", "instagram disconnected");

    // 2. Delete detected products
    const deletedProducts = await q<any>(
      `DELETE FROM detected_products WHERE project_id = $1 RETURNING id`,
      [PROJECT_ID]
    );
    log("api:chat:reset", "products deleted", { count: deletedProducts.length });

    // 3. Delete old chat sessions and messages
    await q(`DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE project_id = $1)`, [PROJECT_ID]);
    await q(`DELETE FROM chat_notifications WHERE project_id = $1`, [PROJECT_ID]);
    await q(`DELETE FROM chat_sessions WHERE project_id = $1`, [PROJECT_ID]);
    log("api:chat:reset", "old sessions deleted");

    // 4. Reset brand profile to empty
    await q(
      `UPDATE brand_profiles SET profile = '{}'::jsonb WHERE project_id = $1`,
      [PROJECT_ID]
    );

    // 5. Create new session
    const id = "chat_" + uuid();
    const initialStep = "init";

    await q(
      `INSERT INTO chat_sessions(id, project_id, state) VALUES ($1,$2,$3)`,
      [id, PROJECT_ID, JSON.stringify({ step: initialStep })]
    );

    // 6. Create welcome message
    const m1 = "msg_" + uuid();
    const welcomeText = `Bok! 👋 Ja sam Vissocial, tvoj AI asistent za Instagram sadržaj.

Kako želiš započeti?

1. **Brzi pregled** - upiši Instagram username (npr. @mojbrand) i dobij brzu analizu profila
2. **Spoji Instagram** - povezivanje za punu funkcionalnost
3. **Nastavi bez Instagrama** - ručni upload slika`;

    const chips = [
      { type: "suggestion", label: "Brzi pregled profila", value: "brzi pregled" },
      { type: "suggestion", label: "Spoji Instagram", value: "spoji instagram" },
      { type: "suggestion", label: "Nastavi bez Instagrama", value: "nastavi bez" }
    ];

    await q(
      `INSERT INTO chat_messages(id, session_id, role, text, meta) VALUES ($1,$2,'assistant',$3,$4)`,
      [m1, id, welcomeText, JSON.stringify({ chips })]
    );

    log("api:chat:reset", "new session created", { session_id: id });

    // Get messages for response
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
      reset: {
        products_deleted: deletedProducts.length,
        instagram_disconnected: true
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
