import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { chip, ChatChip, ONBOARDING_QUESTIONS } from "@/lib/chatChips";

const PROJECT_ID = "proj_local";

// ============================================================
// SYSTEM STATE HELPER
// ============================================================

interface SystemState {
  ig_connected: boolean;
  ig_username: string | null;
  media_count: number;
  media_analyzed: number;
  pending_products: number;
  confirmed_products: number;
  brand_profile_ready: boolean;
  brand_name: string | null;
  active_jobs: number;
  has_references: boolean;
}

async function getSystemState(): Promise<SystemState> {
  // Instagram status from projects table
  const [project] = await q<any>(
    `SELECT ig_connected, ig_user_id, name FROM projects WHERE id = $1`,
    [PROJECT_ID]
  ).catch(() => [{ ig_connected: false, ig_user_id: null, name: null }]);

  // Assets count
  const [assets] = await q<any>(
    `SELECT 
       COUNT(*) as total,
       COUNT(CASE WHEN id IN (SELECT asset_id FROM instagram_analyses) THEN 1 END) as analyzed
     FROM assets WHERE project_id = $1`,
    [PROJECT_ID]
  ).catch(() => [{ total: 0, analyzed: 0 }]);

  // Products count
  const [products] = await q<any>(
    `SELECT 
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed
     FROM detected_products WHERE project_id = $1`,
    [PROJECT_ID]
  ).catch(() => [{ pending: 0, confirmed: 0 }]);

  // Brand profile
  const [brandProfile] = await q<any>(
    `SELECT profile FROM brand_profiles WHERE project_id = $1`,
    [PROJECT_ID]
  ).catch(() => [{ profile: null }]);

  // Active jobs
  const [jobs] = await q<any>(
    `SELECT COUNT(*) as count FROM jobs 
     WHERE project_id = $1 AND status IN ('queued', 'running')`,
    [PROJECT_ID]
  ).catch(() => [{ count: 0 }]);

  // Reference assets
  const [refs] = await q<any>(
    `SELECT COUNT(*) as count FROM assets 
     WHERE project_id = $1 AND (label LIKE '%reference%' OR source = 'upload')`,
    [PROJECT_ID]
  ).catch(() => [{ count: 0 }]);

  const profile = brandProfile?.profile;
  const brandName = profile?.brand_name || project?.name || null;

  return {
    ig_connected: project?.ig_connected || false,
    ig_username: project?.ig_user_id || null,
    media_count: parseInt(assets?.total || "0"),
    media_analyzed: parseInt(assets?.analyzed || "0"),
    pending_products: parseInt(products?.pending || "0"),
    confirmed_products: parseInt(products?.confirmed || "0"),
    brand_profile_ready: !!(profile && Object.keys(profile).length > 2),
    brand_name: brandName,
    active_jobs: parseInt(jobs?.count || "0"),
    has_references: parseInt(refs?.count || "0") > 0,
  };
}

// ============================================================
// SMART WELCOME MESSAGE GENERATOR
// ============================================================

interface WelcomeResult {
  text: string;
  chips: ChatChip[];
  initialStep: string;
}

function generateSmartWelcome(state: SystemState): WelcomeResult {
  // SCENARIO A: Instagram connected, has media, has pending products
  if (state.ig_connected && state.media_count > 0 && state.pending_products > 0) {
    return {
      text: `Bok! 👋 Dobro došao natrag!\n\nVidim da imam **${state.pending_products} proizvoda** za potvrdu iz tvog Instagrama. Potvrdi ih da mogu bolje personalizirati sadržaj.`,
      chips: [
        chip.suggestion("Prikaži proizvode"),
        chip.suggestion("Potvrdi sve proizvode"),
        chip.suggestion("Status"),
      ],
      initialStep: "confirm_products",
    };
  }

  // SCENARIO B: Instagram connected, has media, all analyzed, ready
  if (state.ig_connected && state.media_count > 0 && state.brand_profile_ready) {
    return {
      text: `Bok! 👋 Spreman si za generiranje!\n\n✅ Instagram povezan\n✅ ${state.media_count} slika analizirano\n✅ ${state.confirmed_products} proizvoda potvrđeno\n✅ Brand profil spreman\n\nŽeliš li generirati plan za ovaj mjesec?`,
      chips: [
        chip.suggestion("Generiraj plan"),
        chip.navigation("Otvori Calendar", "/calendar"),
        chip.suggestion("Status"),
      ],
      initialStep: "ready",
    };
  }

  // SCENARIO C: Instagram connected, media exists but not analyzed
  if (state.ig_connected && state.media_count > 0 && state.media_analyzed < state.media_count) {
    return {
      text: `Bok! 👋 Vidim da imaš ${state.media_count} slika s Instagrama.\n\nAnaliza je u tijeku (${state.media_analyzed}/${state.media_count})...\n\nU međuvremenu, reci mi malo više o sebi!`,
      chips: [
        chip.onboarding("🏷️ Product brand", "profile_type", "product"),
        chip.onboarding("🌿 Lifestyle", "profile_type", "lifestyle"),
        chip.onboarding("👤 Creator", "profile_type", "creator"),
      ],
      initialStep: "profile_type",
    };
  }

  // SCENARIO D: Instagram JUST connected (no media yet, ingest job running)
  if (state.ig_connected && state.media_count === 0) {
    return {
      text: `🎉 **Instagram uspješno povezan!**\n\nPokrećem povlačenje tvojih objava i analizu stila. To može potrajati minutu-dvije.\n\nU međuvremenu, koji tip profila te najbolje opisuje?`,
      chips: [
        chip.onboarding("🏷️ Product brand", "profile_type", "product"),
        chip.onboarding("🌿 Lifestyle", "profile_type", "lifestyle"),
        chip.onboarding("👤 Creator/Influencer", "profile_type", "creator"),
        chip.onboarding("📝 Content/Media", "profile_type", "content"),
      ],
      initialStep: "profile_type",
    };
  }

  // SCENARIO E: Default - Instagram NOT connected (Instagram-first approach)
  return {
    text: `Bok! 👋 Ja sam Vissocial, tvoj AI asistent za Instagram.\n\n**Najbolji način da te upoznam** je kroz tvoj Instagram profil. Povežeš li ga, automatski ću analizirati:\n• Tvoj vizualni stil\n• Proizvode koje promovirate\n• Ton komunikacije\n\n...i kreirati personalizirani content plan!\n\nAko nemaš Instagram ili ga ne želiš povezati, možemo krenuti drugačije.`,
    chips: [
      chip.navigation("🔗 Poveži Instagram (preporučeno)", "/settings"),
      chip.onboarding("⏭️ Nemam IG / Preskoči", "fallback_source", "skip"),
    ],
    initialStep: "init",
  };
}

// ============================================================
// ENSURE PROJECT EXISTS
// ============================================================

async function ensureProject() {
  await q(
    `INSERT INTO projects(id, name) VALUES ($1, 'Local Project') 
     ON CONFLICT (id) DO NOTHING`,
    [PROJECT_ID]
  );
  await q(
    `INSERT INTO brand_profiles(project_id, language, profile) 
     VALUES ($1, 'hr', '{}'::jsonb) 
     ON CONFLICT (project_id, language) DO NOTHING`,
    [PROJECT_ID]
  );
}

// ============================================================
// POST - Create new session
// ============================================================

export async function POST() {
  try {
    await ensureProject();

    // Get system state
    const systemState = await getSystemState();

    // Generate smart welcome
    const welcome = generateSmartWelcome(systemState);

    // Create session with initial state
    const sessionId = "chat_" + uuid();
    const initialState = {
      step: welcome.initialStep,
      system_state_at_start: systemState,
      answered_questions: [],
      optional_question_index: 0,
    };

    await q(
      `INSERT INTO chat_sessions(id, project_id, state) VALUES ($1,$2,$3)`,
      [sessionId, PROJECT_ID, JSON.stringify(initialState)]
    );

    log("api:chat:session", "new session created", {
      session_id: sessionId,
      initial_step: welcome.initialStep,
      ig_connected: systemState.ig_connected,
    });

    // Create welcome message
    const msgId = "msg_" + uuid();
    await q(
      `INSERT INTO chat_messages(id, session_id, role, text, meta) VALUES ($1,$2,'assistant',$3,$4)`,
      [msgId, sessionId, welcome.text, JSON.stringify({ chips: welcome.chips })]
    );

    // Return session with messages
    const messages = await q<any>(
      `SELECT id, role, text, meta FROM chat_messages WHERE session_id=$1 ORDER BY created_at`,
      [sessionId]
    );

    const mapped = messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      chips: m.meta?.chips,
    }));

    return NextResponse.json({
      session_id: sessionId,
      messages: mapped,
      system_state: systemState,
    });
  } catch (error: any) {
    log("api:chat:session", "error creating session", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================
// GET - Load existing session (with state change detection)
// ============================================================

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const session_id = url.searchParams.get("session_id");

    if (!session_id) {
      return NextResponse.json({ error: "session_id required" }, { status: 400 });
    }

    // Get current system state
    const currentState = await getSystemState();

    // Get session and its original state
    const [session] = await q<any>(
      `SELECT state FROM chat_sessions WHERE id = $1`,
      [session_id]
    );

    const sessionState = session?.state || {};

    // Get messages
    const messages = await q<any>(
      `SELECT id, role, text, meta FROM chat_messages WHERE session_id=$1 ORDER BY created_at`,
      [session_id]
    );

    const mapped = messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      chips: m.meta?.chips,
    }));

    return NextResponse.json({
      session_id,
      messages: mapped,
      system_state: currentState,
      session_state: sessionState,
    });
  } catch (error: any) {
    log("api:chat:session", "error loading session", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
