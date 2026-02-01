import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { qLLM, qExport, qMetrics, qBrandRebuild, qIngest, qAnalyze } from "@/lib/jobs";
import { log } from "@/lib/logger";
import {
  chip,
  ChatChip,
  ONBOARDING_QUESTIONS,
  REQUIRED_QUESTIONS,
  OPTIONAL_QUESTIONS,
} from "@/lib/chatChips";

const PROJECT_ID = "proj_local";

// ============================================================
// TYPES
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

interface SessionState {
  step: string;
  brand_name?: string;
  profile_type?: string;
  industry?: string;
  goal?: string;
  frequency?: string;
  tone?: string;
  answered_questions: string[];
  optional_question_index: number;
  system_state_at_start?: SystemState;
  [key: string]: any;
}

// ============================================================
// HELPERS
// ============================================================

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function pushMessage(
  session_id: string,
  role: "user" | "assistant",
  text: string,
  chips: ChatChip[] | null = null
) {
  const id = "msg_" + uuid();
  const meta = chips ? { chips } : null;

  await q(
    `INSERT INTO chat_messages(id, session_id, role, text, meta)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, session_id, role, text, meta ? JSON.stringify(meta) : null]
  );

  return { id, role, text, chips };
}

async function updateSessionState(session_id: string, updates: Partial<SessionState>) {
  const [sess] = await q<any>(`SELECT state FROM chat_sessions WHERE id = $1`, [session_id]);
  const currentState = sess?.state ?? {};
  const newState = { ...currentState, ...updates };

  await q(`UPDATE chat_sessions SET state = $1 WHERE id = $2`, [
    JSON.stringify(newState),
    session_id,
  ]);

  return newState;
}

async function getSessionState(session_id: string): Promise<SessionState> {
  const [sess] = await q<any>(`SELECT state FROM chat_sessions WHERE id = $1`, [session_id]);
  return sess?.state ?? { step: "init", answered_questions: [], optional_question_index: 0 };
}

// ============================================================
// SYSTEM STATE
// ============================================================

async function getSystemState(): Promise<SystemState> {
  const [project] = await q<any>(
    `SELECT ig_connected, ig_user_id, name FROM projects WHERE id = $1`,
    [PROJECT_ID]
  ).catch(() => [{ ig_connected: false, ig_user_id: null, name: null }]);

  const [assets] = await q<any>(
    `SELECT 
       COUNT(*) as total,
       COUNT(CASE WHEN id IN (SELECT asset_id FROM instagram_analyses) THEN 1 END) as analyzed
     FROM assets WHERE project_id = $1`,
    [PROJECT_ID]
  ).catch(() => [{ total: 0, analyzed: 0 }]);

  const [products] = await q<any>(
    `SELECT 
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed
     FROM detected_products WHERE project_id = $1`,
    [PROJECT_ID]
  ).catch(() => [{ pending: 0, confirmed: 0 }]);

  const [brandProfile] = await q<any>(
    `SELECT profile FROM brand_profiles WHERE project_id = $1`,
    [PROJECT_ID]
  ).catch(() => [{ profile: null }]);

  const [jobs] = await q<any>(
    `SELECT COUNT(*) as count FROM jobs 
     WHERE project_id = $1 AND status IN ('queued', 'running')`,
    [PROJECT_ID]
  ).catch(() => [{ count: 0 }]);

  const [refs] = await q<any>(
    `SELECT COUNT(*) as count FROM assets 
     WHERE project_id = $1 AND (label LIKE '%reference%' OR source = 'upload')`,
    [PROJECT_ID]
  ).catch(() => [{ count: 0 }]);

  const profile = brandProfile?.profile;

  return {
    ig_connected: project?.ig_connected || false,
    ig_username: project?.ig_user_id || null,
    media_count: parseInt(assets?.total || "0"),
    media_analyzed: parseInt(assets?.analyzed || "0"),
    pending_products: parseInt(products?.pending || "0"),
    confirmed_products: parseInt(products?.confirmed || "0"),
    brand_profile_ready: !!(profile && Object.keys(profile).length > 2),
    brand_name: profile?.brand_name || project?.name || null,
    active_jobs: parseInt(jobs?.count || "0"),
    has_references: parseInt(refs?.count || "0") > 0 || parseInt(assets?.total || "0") > 0,
  };
}

// ============================================================
// READINESS CHECK
// ============================================================

interface ReadinessResult {
  ready: boolean;
  missing: string[];
  warnings: string[];
}

function checkReadiness(state: SystemState, sessionState: SessionState): ReadinessResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // NUŽNO: Ime brenda
  if (!state.brand_name && !sessionState.brand_name) {
    missing.push("Ime brenda");
  }

  // NUŽNO: Tip profila
  if (!sessionState.profile_type) {
    missing.push("Tip profila");
  }

  // NUŽNO: Barem 1 proizvod ILI kategorija
  if (state.confirmed_products === 0 && !sessionState.industry) {
    missing.push("Proizvod ili kategorija");
  }

  // NUŽNO: Barem 1 vizualna referenca
  if (!state.has_references) {
    missing.push("Vizualna referenca (IG slike, upload, ili web logo)");
  }

  // UPOZORENJA (ne blokiraju, ali upozoravaju)
  if (state.pending_products > 0) {
    warnings.push(`${state.pending_products} proizvoda čeka potvrdu`);
  }

  if (!sessionState.goal) {
    warnings.push("Cilj nije definiran");
  }

  return {
    ready: missing.length === 0,
    missing,
    warnings,
  };
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleCommand(
  norm: string,
  session_id: string,
  state: SystemState,
  sessionState: SessionState
): Promise<{ handled: boolean; response?: { text: string; chips?: ChatChip[] } }> {
  
  // STATUS
  if (/\b(status|stanje|pregled)\b/.test(norm) && !norm.includes("proizvod")) {
    const readiness = checkReadiness(state, sessionState);
    
    let text = `📊 **Status projekta:**\n\n`;
    text += `• Instagram: ${state.ig_connected ? "✅ Povezan" : "❌ Nije povezan"}\n`;
    text += `• Slike: ${state.media_count} (analizirano: ${state.media_analyzed})\n`;
    text += `• Proizvodi: ${state.confirmed_products} potvrđenih, ${state.pending_products} čeka\n`;
    text += `• Brand profil: ${state.brand_profile_ready ? "✅ Spreman" : "⏳ Nije spreman"}\n`;
    text += `• Aktivni jobovi: ${state.active_jobs}\n\n`;

    if (readiness.ready) {
      text += `✅ **Spreman za generiranje!**`;
    } else {
      text += `⚠️ **Prije generiranja treba:**\n`;
      readiness.missing.forEach((m) => (text += `• ${m}\n`));
    }

    const chips: ChatChip[] = [];
    if (!state.ig_connected) chips.push(chip.navigation("Poveži Instagram", "/settings"));
    if (state.pending_products > 0) chips.push(chip.suggestion("Prikaži proizvode"));
    if (readiness.ready) chips.push(chip.suggestion("Generiraj plan"));

    return { handled: true, response: { text, chips } };
  }

  // GENERIRAJ PLAN
  if (/\b(generiraj|generate|kreiraj|napravi|stvori).*(plan|content|sadrzaj)/i.test(norm) ||
      /\b(plan|content).*(generiraj|generate|kreiraj)/i.test(norm) ||
      norm === "generiraj plan" || norm === "generiraj") {
    const readiness = checkReadiness(state, sessionState);

    if (!readiness.ready) {
      let text = `⚠️ Ne mogu još generirati plan. Nedostaje:\n\n`;
      readiness.missing.forEach((m) => (text += `• ${m}\n`));
      text += `\nRiješi ovo prvo pa ćemo generirati!`;

      const chips: ChatChip[] = [];
      if (!state.ig_connected) chips.push(chip.navigation("Poveži Instagram", "/settings"));
      if (readiness.missing.includes("Tip profila")) {
        chips.push(chip.onboarding("🏷️ Product brand", "profile_type", "product"));
        chips.push(chip.onboarding("🌿 Lifestyle", "profile_type", "lifestyle"));
      }

      return { handled: true, response: { text, chips } };
    }

    // Warnings but can proceed
    if (readiness.warnings.length > 0) {
      let text = `⚠️ Mogu generirati, ali:\n`;
      readiness.warnings.forEach((w) => (text += `• ${w}\n`));
      text += `\nŽeliš li nastaviti svejedno?`;

      return {
        handled: true,
        response: {
          text,
          chips: [
            chip.suggestion("Da, generiraj svejedno"),
            chip.suggestion("Ne, prvo ću popraviti"),
          ],
        },
      };
    }

    // All good - generate!
    const month = new Date().toISOString().slice(0, 7);
    await qLLM.add("plan.generate", { project_id: PROJECT_ID, month, limit: null });

    return {
      handled: true,
      response: {
        text: `🚀 Generiram plan za ${month}!\n\nOvo može potrajati nekoliko minuta. Obavijestit ću te kad bude gotovo.`,
        chips: [chip.navigation("Otvori Calendar", "/calendar")],
      },
    };
  }

  // FORCE GENERATE (after warning)
  if (/\b(da.*generiraj|generiraj.*svejedno)\b/.test(norm)) {
    const month = new Date().toISOString().slice(0, 7);
    await qLLM.add("plan.generate", { project_id: PROJECT_ID, month, limit: null });

    return {
      handled: true,
      response: {
        text: `🚀 OK, generiram plan za ${month}!\n\nObavijestit ću te kad bude gotovo.`,
        chips: [chip.navigation("Otvori Calendar", "/calendar")],
      },
    };
  }

  // PRIKAŽI PROIZVODE
  if (/\b(prikazi|prikaz|show|lista|list).*(proizvod|product)/i.test(norm) || 
      /\b(proizvod|product).*(prikazi|prikaz|show|lista)/i.test(norm) ||
      /\b(prikazi|prikaz).*(preostal)/i.test(norm)) {
    if (state.pending_products === 0 && state.confirmed_products === 0) {
      return {
        handled: true,
        response: {
          text: "Nema detektiranih proizvoda. Poveži Instagram ili dodaj ručno.",
          chips: [chip.navigation("Poveži Instagram", "/settings")],
        },
      };
    }

    const products = await q<any>(
      `SELECT id, product_name, category, confidence, status
       FROM detected_products 
       WHERE project_id = $1 
       ORDER BY status ASC, confidence DESC
       LIMIT 15`,
      [PROJECT_ID]
    );

    let text = `📦 **Proizvodi:**\n\n`;
    const chips: ChatChip[] = [];

    const pending = products.filter((p: any) => p.status === "pending");
    const confirmed = products.filter((p: any) => p.status === "confirmed");

    if (pending.length > 0) {
      text += `**Za potvrdu (${state.pending_products}):**\n`;
      text += `_(Klikni ✓ za potvrdu, možeš potvrditi više proizvoda)_\n\n`;
      pending.forEach((p: any) => {
        text += `• ${p.product_name} (${p.category || "?"}) - ${Math.round((p.confidence || 0) * 100)}%\n`;
        chips.push(chip.productConfirm(p.product_name, p.id));
      });
      chips.push(chip.suggestion("Potvrdi sve"));
      chips.push(chip.suggestion("Gotovo s potvrdama"));
    }

    if (confirmed.length > 0) {
      text += `\n**✅ Potvrđeni (${state.confirmed_products}):**\n`;
      confirmed.slice(0, 5).forEach((p: any) => {
        text += `• ${p.product_name}\n`;
      });
      if (state.confirmed_products > 5) {
        text += `_(i još ${state.confirmed_products - 5})_\n`;
      }
    }

    if (pending.length === 0 && confirmed.length > 0) {
      text += `\n✅ Svi proizvodi su potvrđeni!`;
      chips.push(chip.suggestion("Generiraj plan"));
      chips.push(chip.suggestion("Status"));
    }

    return { handled: true, response: { text, chips } };
  }

  // POTVRDI SVE PROIZVODE
  if (/\b(potvrdi|confirm).*(sve|all)/i.test(norm) || /\bpotvrdi\b.*\bproizvod/i.test(norm)) {
    if (state.pending_products === 0) {
      return {
        handled: true,
        response: { text: "Nema proizvoda za potvrdu!", chips: [chip.suggestion("Status")] },
      };
    }

    await q(
      `UPDATE detected_products SET status = 'confirmed'
       WHERE project_id = $1 AND status = 'pending'`,
      [PROJECT_ID]
    );

    await qBrandRebuild.add("brand.rebuild", {
      project_id: PROJECT_ID,
      trigger: "products_confirmed",
    });

    return {
      handled: true,
      response: {
        text: `✅ Potvrdio sam ${state.pending_products} proizvoda!\n\nPokrećem rebuild brand profila...`,
        chips: [chip.suggestion("Generiraj plan"), chip.navigation("Pogledaj Profil", "/profile")],
      },
    };
  }

  // POVEŽI INSTAGRAM
  if (/\b(povezi|connect|spoji).*(insta|ig)/i.test(norm) ||
      /\b(insta|ig).*(povezi|connect|spoji)/i.test(norm)) {
    return {
      handled: true,
      response: {
        text: `Otvori Settings i klikni "Connect Instagram". Nakon povezivanja, automatski ću povući tvoje objave i analizirati stil.`,
        chips: [chip.navigation("Otvori Settings", "/settings")],
      },
    };
  }

  // EXPORT
  if (/\b(export|izvoz|download)\b/.test(norm)) {
    await qExport.add("export.pack", { project_id: PROJECT_ID, approved_only: true });
    return {
      handled: true,
      response: {
        text: "Pripremam export...",
        chips: [chip.navigation("Otvori Export", "/export")],
      },
    };
  }

  // HELP
  if (/\b(help|pomoc|pomozi|kako)\b/i.test(norm)) {
    return {
      handled: true,
      response: {
        text: `🤖 **Evo što mogu:**\n\n• **status** - pregled stanja\n• **poveži instagram** - povezivanje\n• **prikaži proizvode** - lista proizvoda\n• **potvrdi sve** - potvrdi sve proizvode\n• **generiraj plan** - kreiraj content\n• **export** - pripremi za download\n\nIli me pitaj bilo što! 😊`,
        chips: [chip.suggestion("Status"), chip.suggestion("Generiraj plan")],
      },
    };
  }

  // PRODUCT CONFIRMATION ACKNOWLEDGMENT (after user clicks ✓ chip)
  if (/\b(potvrdio|potvrdila|odbio|odbila)\b.*:/i.test(norm)) {
    // User just confirmed/rejected a product via chip
    // Show remaining products or continue flow
    const updatedState = await getSystemState();
    
    if (updatedState.pending_products > 0) {
      return {
        handled: true,
        response: {
          text: `👍 Odlično! Još ${updatedState.pending_products} proizvoda za potvrdu.`,
          chips: [
            chip.suggestion("Prikaži preostale"),
            chip.suggestion("Potvrdi sve preostale"),
            chip.suggestion("Gotovo s potvrdama"),
          ],
        },
      };
    } else {
      // All products confirmed
      await qBrandRebuild.add("brand.rebuild", {
        project_id: PROJECT_ID,
        trigger: "products_confirmed",
      });
      
      return {
        handled: true,
        response: {
          text: `✅ Svi proizvodi potvrđeni!\n\nPokrećem rebuild brand profila...`,
          chips: [chip.suggestion("Generiraj plan"), chip.suggestion("Status")],
        },
      };
    }
  }

  // PRIKAŽI PREOSTALE (alias for prikaži proizvode)
  if (/\b(prikazi|prikaz|show).*(preostal|remaining)/i.test(norm)) {
    // Redirect to show products
    norm = "prikazi proizvode";
  }

  // GOTOVO S POTVRDAMA
  if (/\b(gotovo|done|zavrsi|završi).*(potvrda|confirm)/i.test(norm)) {
    const updatedState = await getSystemState();
    
    if (updatedState.pending_products > 0) {
      return {
        handled: true,
        response: {
          text: `OK! Imaš još ${updatedState.pending_products} nepotvrđenih proizvoda, ali možemo nastaviti.\n\nKoji tip profila te najbolje opisuje?`,
          chips: ONBOARDING_QUESTIONS.profile_type.chips,
        },
      };
    }
    
    // Check readiness
    const readiness = checkReadiness(updatedState, sessionState);
    if (readiness.ready) {
      return {
        handled: true,
        response: {
          text: `🎉 Odlično! Spreman si za generiranje!`,
          chips: [chip.suggestion("Generiraj plan")],
        },
      };
    }
    
    return {
      handled: true,
      response: {
        text: `OK! Nastavljamo s pitanjima.\n\nKoji tip profila te najbolje opisuje?`,
        chips: ONBOARDING_QUESTIONS.profile_type.chips,
      },
    };
  }

  return { handled: false };
}

// ============================================================
// ONBOARDING FSM
// ============================================================

async function handleOnboarding(
  session_id: string,
  text: string,
  norm: string,
  state: SystemState,
  sessionState: SessionState
): Promise<{ text: string; chips?: ChatChip[]; newStep?: string } | null> {
  const step = sessionState.step;
  const answeredQuestions = sessionState.answered_questions || [];

  log("chat:fsm", "onboarding", { session_id, step, norm });

  // GLOBAL: Handle profile type selection from anywhere
  const profileTypeMatch = norm.match(/\b(product|lifestyle|creator|influencer|content|media)\b/i);
  if (profileTypeMatch && !sessionState.profile_type) {
    const typeMap: Record<string, string> = {
      product: "product",
      lifestyle: "lifestyle",
      creator: "creator",
      influencer: "creator",
      content: "content",
      media: "content",
    };
    
    const profileType = typeMap[profileTypeMatch[1].toLowerCase()] || "product";
    
    await updateSessionState(session_id, {
      profile_type: profileType,
      step: "industry",
      answered_questions: [...answeredQuestions, "profile_type"],
    });

    return {
      text: `Odlično, **${profileType}** profil! 👍\n\nKoja je tvoja industrija ili kategorija?`,
      chips: ONBOARDING_QUESTIONS.industry.chips,
      newStep: "industry",
    };
  }

  // GLOBAL: Handle industry selection from anywhere  
  const industryMatch = norm.match(/\b(knjig|izdava|moda|odje|hran|restoran|tech|software|fit|zdravlj|uslug|services|books|fashion|food|fitness)\b/i);
  if (industryMatch && sessionState.profile_type && !sessionState.industry) {
    const industryMap: Record<string, string> = {
      knjig: "books", izdava: "books", books: "books",
      moda: "fashion", odje: "fashion", fashion: "fashion",
      hran: "food", restoran: "food", food: "food",
      tech: "tech", software: "tech",
      fit: "fitness", zdravlj: "fitness", fitness: "fitness",
      uslug: "services", services: "services",
    };
    
    let industry = "other";
    for (const [key, value] of Object.entries(industryMap)) {
      if (norm.includes(key)) {
        industry = value;
        break;
      }
    }

    await updateSessionState(session_id, {
      industry: industry,
      step: "goal",
      answered_questions: [...answeredQuestions, "industry"],
    });

    return {
      text: `Super! 📚\n\nKoji je tvoj glavni cilj za idući mjesec?`,
      chips: ONBOARDING_QUESTIONS.goal.chips,
      newStep: "goal",
    };
  }

  // INIT - Waiting for IG connect or fallback choice
  if (step === "init") {
    // User chose to skip Instagram
    if (norm.includes("preskoči") || norm.includes("nemam") || norm.includes("skip")) {
      await updateSessionState(session_id, { step: "fallback_name" });
      return {
        text: `Nema problema! 👍\n\nKako se zove tvoj brend, firma ili profil?\n\n(Npr. "Školska knjiga", "Cafe Central", "Marko Fitness")`,
        chips: [],
        newStep: "fallback_name",
      };
    }

    // User might have just connected IG - check
    if (state.ig_connected) {
      await updateSessionState(session_id, { step: "profile_type" });
      return {
        text: `Super! 🎉 Instagram je povezan!\n\nPokrećem analizu tvojih objava u pozadini...\n\nU međuvremenu, koji tip profila te najbolje opisuje?`,
        chips: ONBOARDING_QUESTIONS.profile_type.chips,
        newStep: "profile_type",
      };
    }

    // Still waiting
    return {
      text: `Poveži Instagram u Settings za najbolje rezultate, ili odaberi "Preskoči" ako ga nemaš.`,
      chips: [
        chip.navigation("🔗 Poveži Instagram", "/settings"),
        chip.onboarding("⏭️ Preskoči", "fallback_source", "skip"),
      ],
    };
  }

  // FALLBACK NAME - User entering brand name manually
  if (step === "fallback_name") {
    // Save brand name and move to profile type
    const brandName = text.trim();
    await updateSessionState(session_id, {
      brand_name: brandName,
      step: "fallback_source",
      answered_questions: [...answeredQuestions, "brand_name"],
    });

    return {
      text: `Super, **${brandName}**! 👍\n\nImaš li web stranicu koju mogu pretražiti za više informacija? Ili možeš uploadati slike.`,
      chips: [
        chip.onboarding("🌐 Da, imam web", "fallback_source", "web"),
        chip.onboarding("📤 Uploadat ću slike", "fallback_source", "upload"),
        chip.onboarding("⏭️ Preskoči, nastavi pitanja", "fallback_source", "skip_to_questions"),
      ],
      newStep: "fallback_source",
    };
  }

  // FALLBACK SOURCE - Web or upload choice
  if (step === "fallback_source") {
    if (norm.includes("web") || norm.includes("stranicu")) {
      await updateSessionState(session_id, { step: "web_url" });
      return {
        text: `Odlično! Koja je URL adresa tvoje web stranice?\n\n(Npr. "www.skolskaknjiga.hr" ili "skolskaknjiga.hr")`,
        chips: [],
        newStep: "web_url",
      };
    }

    if (norm.includes("upload") || norm.includes("slike")) {
      await updateSessionState(session_id, { step: "profile_type" });
      return {
        text: `Super! Slike možeš uploadati u Settings → Reference Images.\n\nU međuvremenu, koji tip profila te najbolje opisuje?`,
        chips: [
          ...ONBOARDING_QUESTIONS.profile_type.chips,
          chip.navigation("📤 Upload slike", "/settings"),
        ],
        newStep: "profile_type",
      };
    }

    // Skip to questions
    await updateSessionState(session_id, { step: "profile_type" });
    return {
      text: `OK! Koji tip profila te najbolje opisuje?`,
      chips: ONBOARDING_QUESTIONS.profile_type.chips,
      newStep: "profile_type",
    };
  }

  // WEB URL - User entering website
  if (step === "web_url") {
    // Extract URL from text
    let url = text.trim();
    if (!url.startsWith("http")) {
      url = "https://" + url;
    }

    await updateSessionState(session_id, {
      website_url: url,
      step: "profile_type",
      answered_questions: [...answeredQuestions, "website_url"],
    });

    // TODO: Faza 3.2 će dodati stvarni web scrape
    return {
      text: `Spremio sam **${url}**! 🌐\n\n(Web pretraga dolazi uskoro u sljedećoj verziji)\n\nKoji tip profila te najbolje opisuje?`,
      chips: ONBOARDING_QUESTIONS.profile_type.chips,
      newStep: "profile_type",
    };
  }

  // PROFILE TYPE - Required question
  if (step === "profile_type") {
    const typeMap: Record<string, string> = {
      product: "product",
      lifestyle: "lifestyle",
      creator: "creator",
      influencer: "creator",
      content: "content",
      media: "content",
    };

    let profileType = "product"; // default
    for (const [key, value] of Object.entries(typeMap)) {
      if (norm.includes(key)) {
        profileType = value;
        break;
      }
    }

    await updateSessionState(session_id, {
      profile_type: profileType,
      step: "industry",
      answered_questions: [...answeredQuestions, "profile_type"],
    });

    return {
      text: `Odlično, **${profileType}** profil! 👍\n\nKoja je tvoja industrija ili kategorija?`,
      chips: ONBOARDING_QUESTIONS.industry.chips,
      newStep: "industry",
    };
  }

  // INDUSTRY - Required question
  if (step === "industry") {
    const industryMap: Record<string, string> = {
      knjig: "books",
      izdava: "books",
      moda: "fashion",
      odje: "fashion",
      hran: "food",
      restoran: "food",
      tech: "tech",
      software: "tech",
      fit: "fitness",
      zdravlj: "fitness",
      uslug: "services",
    };

    let industry = "other";
    for (const [key, value] of Object.entries(industryMap)) {
      if (norm.includes(key)) {
        industry = value;
        break;
      }
    }

    await updateSessionState(session_id, {
      industry: industry,
      step: "goal",
      answered_questions: [...answeredQuestions, "industry"],
    });

    return {
      text: `Super! 📚\n\nKoji je tvoj glavni cilj za idući mjesec?`,
      chips: ONBOARDING_QUESTIONS.goal.chips,
      newStep: "goal",
    };
  }

  // GOAL - Required question
  if (step === "goal") {
    const goalMap: Record<string, string> = {
      engagement: "engagement",
      engage: "engagement",
      rast: "growth",
      pratitelj: "growth",
      promo: "promotion",
      proizvod: "promotion",
      story: "authority",
      autoritet: "authority",
    };

    let goal = "engagement";
    for (const [key, value] of Object.entries(goalMap)) {
      if (norm.includes(key)) {
        goal = value;
        break;
      }
    }

    await updateSessionState(session_id, {
      goal: goal,
      step: "check_products",
      answered_questions: [...answeredQuestions, "goal"],
    });

    // After required questions, check if we should ask about products
    const updatedState = await getSystemState();

    if (updatedState.pending_products > 0) {
      await updateSessionState(session_id, { step: "confirm_products" });
      return {
        text: `Odlično! Cilj: **${goal}** 🎯\n\nUsput, pronašao sam **${updatedState.pending_products} proizvoda** iz tvojih objava. Želiš li ih pregledati i potvrditi?`,
        chips: [
          chip.suggestion("Prikaži proizvode"),
          chip.suggestion("Potvrdi sve"),
          chip.suggestion("Preskoči za sad"),
        ],
        newStep: "confirm_products",
      };
    }

    // No products, go to optional questions or ready
    const readiness = checkReadiness(updatedState, {
      ...sessionState,
      goal,
      answered_questions: [...answeredQuestions, "goal"],
    });

    if (readiness.ready) {
      await updateSessionState(session_id, { step: "ready" });
      return {
        text: `Odlično! 🎉 Sve je spremno!\n\n✅ Obavezni podaci prikupljeni\n${readiness.warnings.length > 0 ? `⚠️ ${readiness.warnings.join(", ")}\n` : ""}\nŽeliš li generirati plan?`,
        chips: [chip.suggestion("Generiraj plan"), chip.suggestion("Status")],
        newStep: "ready",
      };
    }

    // Missing something, ask optional or show missing
    await updateSessionState(session_id, { step: "optional_questions" });
    return {
      text: `Super! Još par pitanja dok čekamo da se analiza završi...\n\n${OPTIONAL_QUESTIONS[0].text}`,
      chips: OPTIONAL_QUESTIONS[0].chips,
      newStep: "optional_questions",
    };
  }

  // CONFIRM PRODUCTS
  if (step === "confirm_products") {
    // Let command handler deal with product-related commands
    if (norm.includes("prikaz") || norm.includes("proizvod") || norm.includes("potvrdi") || norm.includes("confirm")) {
      return null; // Pass to command handler
    }
    
    if (norm.includes("preskoci") || norm.includes("skip") || norm.includes("nastavi")) {
      await updateSessionState(session_id, { step: "profile_type" });
      const updatedState = await getSystemState();
      const readiness = checkReadiness(updatedState, sessionState);

      if (readiness.ready) {
        await updateSessionState(session_id, { step: "ready" });
        return {
          text: `OK! Možeš ih potvrditi kasnije.\n\n🎉 Spreman si za generiranje!`,
          chips: [chip.suggestion("Generiraj plan")],
          newStep: "ready",
        };
      }

      return {
        text: `OK! Idemo dalje.\n\nKoji tip profila te najbolje opisuje?`,
        chips: ONBOARDING_QUESTIONS.profile_type.chips,
        newStep: "profile_type",
      };
    }
    
    // Unknown input in this step - guide user
    return {
      text: `Imaš ${state.pending_products} proizvoda za potvrdu. Što želiš napraviti?`,
      chips: [
        chip.suggestion("Prikaži proizvode"),
        chip.suggestion("Potvrdi sve"),
        chip.suggestion("Preskoči za sad"),
      ],
    };
  }

  // OPTIONAL QUESTIONS
  if (step === "optional_questions") {
    const optIndex = sessionState.optional_question_index || 0;

    // Save previous answer if we can determine which question it was
    const currentQuestion = OPTIONAL_QUESTIONS[optIndex];
    if (currentQuestion) {
      await updateSessionState(session_id, {
        [currentQuestion.id]: text,
        answered_questions: [...answeredQuestions, currentQuestion.id],
        optional_question_index: optIndex + 1,
      });
    }

    // Check system state - maybe job finished
    const updatedState = await getSystemState();

    // If products appeared, interrupt and ask
    if (updatedState.pending_products > 0 && !answeredQuestions.includes("products_shown")) {
      await updateSessionState(session_id, {
        step: "confirm_products",
        answered_questions: [...answeredQuestions, currentQuestion?.id, "products_shown"].filter(Boolean),
      });
      return {
        text: `🔔 Analiza je otkrila **${updatedState.pending_products} proizvoda**!\n\nŽeliš li ih pregledati?`,
        chips: [
          chip.suggestion("Prikaži proizvode"),
          chip.suggestion("Potvrdi sve"),
          chip.suggestion("Nastavi pitanja"),
        ],
        newStep: "confirm_products",
      };
    }

    // Check readiness
    const readiness = checkReadiness(updatedState, sessionState);

    if (readiness.ready) {
      await updateSessionState(session_id, { step: "ready" });
      return {
        text: `🎉 Hvala na odgovorima! Sve je spremno za generiranje.\n\n${readiness.warnings.length > 0 ? `Napomena: ${readiness.warnings.join(", ")}` : ""}`,
        chips: [chip.suggestion("Generiraj plan"), chip.navigation("Otvori Calendar", "/calendar")],
        newStep: "ready",
      };
    }

    // More optional questions?
    const nextIndex = optIndex + 1;
    if (nextIndex < OPTIONAL_QUESTIONS.length) {
      return {
        text: `Hvala! ${OPTIONAL_QUESTIONS[nextIndex].text}`,
        chips: OPTIONAL_QUESTIONS[nextIndex].chips,
      };
    }

    // No more questions - show progress
    await updateSessionState(session_id, { step: "waiting_jobs" });
    return {
      text: `Hvala na svim odgovorima! 🙏\n\n⏳ Čekamo da se analiza završi...\n\n📊 Progress:\n• Slike: ${updatedState.media_analyzed}/${updatedState.media_count}\n• Aktivni jobovi: ${updatedState.active_jobs}\n\nJavim ti kad bude gotovo!`,
      chips: [chip.suggestion("Status"), chip.navigation("Pogledaj Settings", "/settings")],
      newStep: "waiting_jobs",
    };
  }

  // WAITING FOR JOBS
  if (step === "waiting_jobs") {
    const updatedState = await getSystemState();

    if (updatedState.pending_products > 0) {
      await updateSessionState(session_id, { step: "confirm_products" });
      return {
        text: `🔔 Analiza gotova! Pronašao sam **${updatedState.pending_products} proizvoda**.`,
        chips: [chip.suggestion("Prikaži proizvode"), chip.suggestion("Potvrdi sve")],
        newStep: "confirm_products",
      };
    }

    const readiness = checkReadiness(updatedState, sessionState);
    if (readiness.ready) {
      await updateSessionState(session_id, { step: "ready" });
      return {
        text: `🎉 Sve je spremno!`,
        chips: [chip.suggestion("Generiraj plan")],
        newStep: "ready",
      };
    }

    return {
      text: `⏳ Još uvijek čekam...\n\n• Slike: ${updatedState.media_analyzed}/${updatedState.media_count}\n• Jobovi: ${updatedState.active_jobs} aktivnih\n\nMožeš se vratiti za par minuta.`,
      chips: [chip.suggestion("Status")],
    };
  }

  // READY
  if (step === "ready") {
    // User is chatting after being ready - treat as general conversation
    return null;
  }

  return null;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    log("api:chat", "POST /api/chat/message", body);

    const { session_id, text } = body as { session_id: string; text: string };

    if (!session_id || !text) {
      return NextResponse.json({ error: "session_id and text required" }, { status: 400 });
    }

    // Save user message
    await pushMessage(session_id, "user", text);

    const norm = normalize(text);
    const state = await getSystemState();
    const sessionState = await getSessionState(session_id);

    // 1. Try command handlers first
    const cmdResult = await handleCommand(norm, session_id, state, sessionState);
    if (cmdResult.handled && cmdResult.response) {
      const a = await pushMessage(session_id, "assistant", cmdResult.response.text, cmdResult.response.chips || null);
      return NextResponse.json({ new_messages: [a] });
    }

    // 2. Try onboarding FSM
    const onboardingResult = await handleOnboarding(session_id, text, norm, state, sessionState);
    if (onboardingResult) {
      if (onboardingResult.newStep) {
        await updateSessionState(session_id, { step: onboardingResult.newStep });
      }
      const a = await pushMessage(session_id, "assistant", onboardingResult.text, onboardingResult.chips || null);
      return NextResponse.json({ new_messages: [a] });
    }

    // 3. Fallback
    const fallbackChips = [chip.suggestion("Status"), chip.suggestion("Pomoć")];

    if (!state.ig_connected) {
      fallbackChips.unshift(chip.navigation("Poveži Instagram", "/settings"));
    }

    const readiness = checkReadiness(state, sessionState);
    if (readiness.ready) {
      fallbackChips.push(chip.suggestion("Generiraj plan"));
    }

    const a = await pushMessage(
      session_id,
      "assistant",
      `Nisam siguran što želiš. Napiši "status", "generiraj plan", ili "pomoć" za listu naredbi.`,
      fallbackChips
    );

    return NextResponse.json({ new_messages: [a] });
  } catch (error: any) {
    log("api:chat:message", "error", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
