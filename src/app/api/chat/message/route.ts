import { NextResponse } from "next/server";
import { q, pool } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { qLLM, qRender, qExport, qPublish, qMetrics } from "@/lib/jobs";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

function normalize(text: string) {
  return text.trim().toLowerCase();
}

async function pushMessage(
  session_id: string,
  role: "user" | "assistant",
  text: string,
  meta: any = null
) {
  const id = "msg_" + uuid();
  await q(
    `INSERT INTO chat_messages(id, session_id, role, text, meta)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, session_id, role, text, meta ? JSON.stringify(meta) : null]
  );
  return { id, role, text, chips: meta?.chips };
}

export async function POST(req: Request) {
  const body = await req.json();
  log("api:chat", "POST /api/chat/message", body);

  const { session_id, text } = body as {
    session_id: string;
    text: string;
  };

  if (!session_id || !text) {
    log("api:chat", "missing session_id or text", body);
    return NextResponse.json(
      { error: "session_id and text required" },
      { status: 400 }
    );
  }

  await pushMessage(session_id, "user", text);

  const norm = normalize(text);

  // =========================
  // COMMANDS
  // =========================

  if (norm.includes("generiraj") || norm.includes("generate")) {
    const month = new Date().toISOString().slice(0, 7);

    log("queue", "enqueue", {
      queue: "q_llm",
      job: "plan.generate",
      project_id: PROJECT_ID,
      month,
      redis: process.env.REDIS_URL
    });

    await qLLM.add("plan.generate", {
      project_id: PROJECT_ID,
      month,
      limit: null
    });

    const a = await pushMessage(
      session_id,
      "assistant",
      `Super! Generiram plan za ${month}. To može potrajati malo (renderovi se rade u pozadini).\n\nIdi na Calendar kad želiš pregled.`,
      { chips: ["Otvori Calendar"] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  if (norm.includes("export")) {
    log("queue", "enqueue", {
      queue: "q_export",
      job: "export.pack",
      project_id: PROJECT_ID
    });

    await qExport.add("export.pack", {
      project_id: PROJECT_ID,
      approved_only: true
    });

    const a = await pushMessage(
      session_id,
      "assistant",
      "Ok! Pripremam export. Otvori Export page za download.",
      { chips: ["Otvori Export"] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  if (norm.includes("pove") && norm.includes("insta")) {
    const a = await pushMessage(
      session_id,
      "assistant",
      "Naravno — otvori Settings i klikni “Connect Instagram”. Nakon toga se vraćaš ovdje.",
      { chips: ["Otvori Settings"] }
    );
    return NextResponse.json({ new_messages: [a] });
  }

  if (norm.includes("metrics") || norm.includes("insights")) {
    log("queue", "enqueue", {
      queue: "q_metrics",
      job: "metrics.ingest",
      project_id: PROJECT_ID,
      window: "24h"
    });

    await qMetrics.add("metrics.ingest", {
      project_id: PROJECT_ID,
      window: "24h"
    });

    const a = await pushMessage(
      session_id,
      "assistant",
      "Pokrećem povlačenje metrika (24h) i update policy-ja.",
      { chips: ["Pogledaj Calendar"] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // ONBOARDING FSM
  // =========================

  const sess = (
    await q<any>(`SELECT state FROM chat_sessions WHERE id=$1`, [session_id])
  )[0];

  const state = sess?.state ?? {};
  const step = state?.step ?? "welcome";

  log("chat:fsm", "state", { session_id, step });

  if (step === "welcome") {
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, goal: text, step: "planned_posts" }), session_id]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      "Top. Imaš li već neke planirane objave za ovaj mjesec?\n\nAko već imaš neke objave — super. Naš AI će ih uzeti u obzir i prilagoditi plan oko njih.",
      { chips: ["Da, imam ideje/materijale", "Ne, krenimo od nule"] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  if (step === "planned_posts") {
    const yes = norm.startsWith("da");

    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [
        JSON.stringify({ ...state, has_planned: yes, step: "profile_type" }),
        session_id
      ]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      "Hvala! Na temelju profila (i ovoga što si rekao/la) čini se da si najbliže tipu: **product brand**.\n\nJe li to točno?",
      { chips: ["Točno", "Promijeni (lifestyle / character / content)"] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  if (step === "profile_type") {
    const confirmed = norm.includes("točno");

    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [
        JSON.stringify({
          ...state,
          profile_type_confirmed: confirmed,
          step: "focus"
        }),
        session_id
      ]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      "Na što se najviše fokusiramo u idućih 30 dana?",
      { chips: ["Engagement", "Rast", "Promocija", "Autoritet / storytelling"] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  if (step === "focus") {
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [
        JSON.stringify({ ...state, focus: text, step: "plan_horizon" }),
        session_id
      ]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      "Koliko unaprijed želiš plan?",
      { chips: ["7 dana (preview)", "30 dana (full plan – Pro)"] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  if (step === "plan_horizon") {
    const month = new Date().toISOString().slice(0, 7);

    log("queue", "enqueue", {
      queue: "q_llm",
      job: "plan.generate",
      project_id: PROJECT_ID,
      month,
      redis: process.env.REDIS_URL
    });

    await qLLM.add("plan.generate", {
      project_id: PROJECT_ID,
      month,
      limit: null
    });

    const a = await pushMessage(
      session_id,
      "assistant",
      "Super! Slažem tvoj plan…\n• Planiranje sadržaja\n• Pisanje captiona\n• Generiranje vizuala\n\nKad bude gotovo, vidiš sve u Calendaru.",
      { chips: ["Otvori Calendar"] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  const a = await pushMessage(
    session_id,
    "assistant",
    "Kužiim 🙂 Ako želiš, napiši: “generiraj plan” ili “export” ili “povuci metrike”."
  );

  return NextResponse.json({ new_messages: [a] });
}
