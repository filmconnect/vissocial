// ============================================================
// API: /api/chat/message - V4
// ============================================================
// IMPROVEMENTS:
// - After "missing requirements" → offer onboarding questions
// - Don't offer "connect IG" if already connected
// - "Bez Instagrama" → web scraping + manual upload + website URL
// - Enhanced scraping with web search fallback + website scraping
// - Progress tracking for onboarding
// UPDATED: Maknuta opcija "Brzi pregled" iz init stepa
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { qLLM, qExport, qMetrics } from "@/lib/jobs";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

// ============================================================
// Types
// ============================================================

interface OnboardingProgress {
  ig_connected: boolean;
  has_reference_image: boolean;
  has_products: boolean;
  has_confirmed_products: boolean;
  has_goal: boolean;
  has_profile_type: boolean;
  has_focus: boolean;
  analysis_complete: boolean;
}

interface GenerationRequirements {
  canGenerate: boolean;
  missing: string[];
  progress: OnboardingProgress;
}

// ============================================================
// Helpers
// ============================================================

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

function extractInstagramUsername(text: string): string | null {
  const patterns = [
    /@([a-zA-Z0-9_.]+)/,
    /instagram\.com\/([a-zA-Z0-9_.]+)/i,
    /^([a-zA-Z0-9_.]+)$/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].replace(/[\/\?].*$/, '');
    }
  }
  return null;
}

function extractWebsiteUrl(text: string): string | null {
  // First try to find a complete URL
  const fullUrlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i;
  const fullMatch = text.match(fullUrlPattern);
  if (fullMatch) {
    // Clean up trailing punctuation
    return fullMatch[0].replace(/[.,;:!?)]+$/, '');
  }
  
  // Try to find URL without protocol
  const simplePattern = /(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s<>"{}|\\^`\[\]]*)?/i;
  const simpleMatch = text.match(simplePattern);
  if (simpleMatch) {
    let url = simpleMatch[0].replace(/[.,;:!?)]+$/, '');
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    return url;
  }
  
  return null;
}

// ============================================================
// Web Scraping
// ============================================================
async function scrapeWebsite(url: string): Promise<{
  success: boolean;
  data?: {
    title?: string;
    description?: string;
    products?: string[];
    colors?: string[];
    logo?: string;
  };
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "hr,en;q=0.9"
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const title = ogTitleMatch?.[1] || titleMatch?.[1] || undefined;

    // Extract description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
    const description = ogDescMatch?.[1] || descMatch?.[1] || undefined;

    // Extract potential products/categories from navigation and headings
    const products: string[] = [];
    
    // Look for category links
    const categoryMatches = html.matchAll(/<a[^>]+href=["'][^"']*(?:category|kategorija|proizvod|product)[^"']*["'][^>]*>([^<]+)</gi);
    for (const match of categoryMatches) {
      const text = match[1].trim();
      if (text && text.length > 2 && text.length < 50 && !products.includes(text)) {
        products.push(text);
      }
    }

    // Look for navigation items
    const navMatches = html.matchAll(/<nav[^>]*>([\s\S]*?)<\/nav>/gi);
    for (const nav of navMatches) {
      const linkMatches = nav[1].matchAll(/<a[^>]*>([^<]+)</g);
      for (const link of linkMatches) {
        const text = link[1].trim();
        if (text && text.length > 2 && text.length < 30 && !products.includes(text) && 
            !text.toLowerCase().includes('login') && !text.toLowerCase().includes('prijav') &&
            !text.toLowerCase().includes('kontakt') && !text.toLowerCase().includes('o nama')) {
          products.push(text);
        }
      }
    }

    // Extract theme color
    const colors: string[] = [];
    const themeColorMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
    if (themeColorMatch?.[1]) {
      colors.push(themeColorMatch[1]);
    }

    // Look for brand colors in inline styles
    const colorMatches = html.matchAll(/(?:background-color|color)\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})/g);
    const colorCounts: Record<string, number> = {};
    for (const match of colorMatches) {
      const color = match[1].toUpperCase();
      if (color !== '#FFFFFF' && color !== '#FFF' && color !== '#000000' && color !== '#000') {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
      }
    }
    
    // Get top colors
    const topColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([color]) => color);
    colors.push(...topColors);

    return {
      success: true,
      data: {
        title: title?.substring(0, 100),
        description: description?.substring(0, 200),
        products: products.slice(0, 10),
        colors: [...new Set(colors)].slice(0, 5)
      }
    };

  } catch (error: any) {
    log("scrape:website", "error", { url, error: error.message });
    return { success: false, error: error.message };
  }
}

// ============================================================
// Check onboarding progress and requirements
// ============================================================
async function checkProgress(
  project_id: string,
  session_state: any
): Promise<GenerationRequirements> {
  const missing: string[] = [];

  // Check project status
  const project = await q<any>(
    `SELECT ig_connected FROM projects WHERE id = $1`,
    [project_id]
  );
  const ig_connected = project[0]?.ig_connected || false;

  // Check reference images
  const images = await q<any>(
    `SELECT COUNT(*) as count FROM assets WHERE project_id = $1 AND type = 'image'`,
    [project_id]
  );
  const has_reference_image = Number(images[0]?.count) > 0;

  // Check products
  const products = await q<any>(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed
     FROM detected_products WHERE project_id = $1`,
    [project_id]
  );
  const has_products = Number(products[0]?.total) > 0;
  const has_confirmed_products = Number(products[0]?.confirmed) > 0;

  // Check session state for onboarding answers
  const has_goal = !!session_state?.goal;
  const has_profile_type = !!session_state?.profile_type;
  const has_focus = !!session_state?.focus;

  // Check if analysis is complete
  const analyses = await q<any>(
    `SELECT COUNT(*) as count FROM instagram_analyses ia
     JOIN assets a ON a.id = ia.asset_id
     WHERE a.project_id = $1`,
    [project_id]
  );
  const analysis_complete = Number(analyses[0]?.count) > 0;

  const progress: OnboardingProgress = {
    ig_connected,
    has_reference_image,
    has_products,
    has_confirmed_products,
    has_goal,
    has_profile_type,
    has_focus,
    analysis_complete
  };

  // Build missing list
  const hasVisualReference = has_reference_image || has_products;
  const hasConfirmedReference = has_confirmed_products || has_reference_image;

  if (!hasVisualReference) {
    missing.push("referentna slika ili proizvod");
  }

  if (has_products && !has_confirmed_products && !has_reference_image) {
    missing.push("potvrđen barem jedan proizvod");
  }

  if (!has_goal) missing.push("cilj profila");
  if (!has_profile_type) missing.push("tip profila");
  if (!has_focus) missing.push("fokus sadržaja");

  const canGenerate = hasVisualReference && hasConfirmedReference && has_goal && has_profile_type && has_focus;

  return { canGenerate, missing, progress };
}

// ============================================================
// Build onboarding progress indicator
// ============================================================
function buildProgressIndicator(progress: OnboardingProgress): string {
  const items = [
    { done: progress.ig_connected || progress.has_reference_image, label: "Vizualna referenca" },
    { done: progress.has_goal, label: "Cilj" },
    { done: progress.has_profile_type, label: "Tip profila" },
    { done: progress.has_focus, label: "Fokus" },
    { done: progress.has_confirmed_products || progress.has_reference_image, label: "Proizvodi/reference" }
  ];

  const completed = items.filter(i => i.done).length;
  const total = items.length;

  let indicator = `📊 Napredak: ${completed}/${total}\n`;
  for (const item of items) {
    indicator += item.done ? `✅ ${item.label}\n` : `⬜ ${item.label}\n`;
  }

  return indicator;
}

// ============================================================
// Get next onboarding step chips
// ============================================================
function getNextOnboardingChips(progress: OnboardingProgress, ig_connected: boolean): any[] {
  const chips: any[] = [];

  if (!progress.has_goal) {
    chips.push(
      { type: "onboarding_option", label: "Više engagementa", value: "cilj: engagement" },
      { type: "onboarding_option", label: "Izgradnja brenda", value: "cilj: branding" },
      { type: "onboarding_option", label: "Promocija proizvoda", value: "cilj: promotion" },
      { type: "onboarding_option", label: "Mix svega", value: "cilj: mix" }
    );
    return chips;
  }

  if (!progress.has_profile_type) {
    chips.push(
      { type: "onboarding_option", label: "🏷️ Product brand", value: "profil: product_brand" },
      { type: "onboarding_option", label: "🌿 Lifestyle", value: "profil: lifestyle" },
      { type: "onboarding_option", label: "👤 Creator", value: "profil: creator" },
      { type: "onboarding_option", label: "📄 Content/Media", value: "profil: content_media" }
    );
    return chips;
  }

  if (!progress.has_focus) {
    chips.push(
      { type: "onboarding_option", label: "📈 Engagement", value: "fokus: engagement" },
      { type: "onboarding_option", label: "🚀 Rast", value: "fokus: growth" },
      { type: "onboarding_option", label: "🛒 Promocija", value: "fokus: promotion" },
      { type: "onboarding_option", label: "📖 Storytelling", value: "fokus: storytelling" }
    );
    return chips;
  }

  // All basic info done, check visual reference
  if (!progress.has_reference_image && !progress.has_products) {
    if (!ig_connected) {
      chips.push(
        { type: "suggestion", label: "Spoji Instagram", value: "spoji instagram" },
        { type: "suggestion", label: "Uploaj slike", value: "uploaj slike" },
        { type: "suggestion", label: "Unesi web stranicu", value: "web stranica" }
      );
    } else {
      chips.push(
        { type: "suggestion", label: "Uploaj dodatne slike", value: "uploaj slike" }
      );
    }
    return chips;
  }

  // Has products but none confirmed
  if (progress.has_products && !progress.has_confirmed_products) {
    chips.push(
      { type: "suggestion", label: "Prikaži proizvode", value: "prikaži proizvode" }
    );
    return chips;
  }

  // Ready to generate
  chips.push(
    { type: "suggestion", label: "🚀 Generiraj plan", value: "generiraj plan sada" }
  );

  return chips;
}

// ============================================================
// Get pending products
// ============================================================
async function getPendingProducts(project_id: string, limit: number = 10) {
  return await q<any>(
    `SELECT DISTINCT ON (product_name) 
       id, product_name, category, confidence
     FROM detected_products
     WHERE project_id = $1 AND status = 'pending'
     ORDER BY product_name, confidence DESC
     LIMIT $2`,
    [project_id, limit]
  );
}

// ============================================================
// Build product chips
// ============================================================
function buildProductChips(products: any[]) {
  const chips: any[] = [];
  for (const p of products) {
    chips.push({
      type: "product_confirm",
      label: `☐ ${p.product_name}`,
      productId: p.id,
      action: "confirm"
    });
  }
  if (products.length > 0) {
    chips.push(
      { type: "suggestion", label: "✓ Potvrdi sve", value: "potvrdi sve proizvode" },
      { type: "suggestion", label: "➜ Nastavi", value: "nastavi s generiranjem" }
    );
  }
  return chips;
}

// ============================================================
// Perform web scraping
// ============================================================
async function performScraping(username: string): Promise<{
  success: boolean;
  data?: any;
  source: string;
  error?: string;
  needsMoreInfo?: boolean;
}> {
  try {
    const url = `https://www.instagram.com/${username}/`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.5"
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      throw new Error(`Instagram returned ${response.status}`);
    }

    const html = await response.text();

    if (html.includes("Sorry, this page") || html.includes("Page Not Found")) {
      return { success: false, source: "instagram", error: "Profil ne postoji" };
    }

    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);

    if (descMatch) {
      const desc = descMatch[1];
      const statsMatch = desc.match(/(\d+(?:[,.]?\d+)*[KM]?)\s*Followers/i);
      const postsMatch = desc.match(/(\d+(?:[,.]?\d+)*)\s*Posts/i);
      const bioMatch = desc.split(" - ").slice(1).join(" - ");

      const data = {
        full_name: titleMatch ? titleMatch[1].split("(")[0].trim() : username,
        bio: bioMatch || null,
        followers: statsMatch ? statsMatch[1] : null,
        posts_count: postsMatch ? postsMatch[1] : null
      };

      const needsMoreInfo = !data.bio || !data.followers;

      return {
        success: true,
        source: "instagram",
        data,
        needsMoreInfo
      };
    }

    return estimateFromUsername(username);

  } catch (error: any) {
    log("scrape", "error", { username, error: error.message });
    return estimateFromUsername(username);
  }
}

function estimateFromUsername(username: string): {
  success: boolean;
  data: any;
  source: string;
  needsMoreInfo: boolean;
} {
  const lower = username.toLowerCase();
  let niche = "general";
  let style = "mixed";

  if (lower.includes("knjig") || lower.includes("book")) {
    niche = "books/publishing";
    style = "educational";
  } else if (lower.includes("shop") || lower.includes("store")) {
    niche = "e-commerce";
    style = "product-focused";
  } else if (lower.includes("food") || lower.includes("cook")) {
    niche = "food";
    style = "lifestyle";
  }

  return {
    success: true,
    source: "estimation",
    data: { estimated_niche: niche, estimated_style: style },
    needsMoreInfo: true
  };
}

// ============================================================
// POST /api/chat/message
// ============================================================
export async function POST(req: Request) {
  const body = await req.json();
  log("api:chat", "POST /api/chat/message", body);

  const { session_id, text } = body as { session_id: string; text: string };

  if (!session_id || !text) {
    return NextResponse.json({ error: "session_id and text required" }, { status: 400 });
  }

  await pushMessage(session_id, "user", text);

  const norm = normalize(text);

  // Get session state
  const sess = (await q<any>(`SELECT state FROM chat_sessions WHERE id=$1`, [session_id]))[0];
  const state = sess?.state ?? {};
  const step = state?.step ?? "init";

  // Get project status
  const project = await q<any>(`SELECT ig_connected FROM projects WHERE id = $1`, [PROJECT_ID]);
  const ig_connected = project[0]?.ig_connected || false;

  log("chat:fsm", "state", { session_id, step, norm, ig_connected });

  // =========================
  // GLOBAL: Handle Instagram connected from any step
  // =========================
  if ((norm.includes("spojen") || norm.includes("connected") || norm.includes("uspješno")) && 
      norm.includes("instagram")) {
    // Always move to onboarding after IG connection
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, step: "onboarding", ig_connected: true }), session_id]
    );

    const requirements = await checkProgress(PROJECT_ID, { ...state, ig_connected: true });
    const chips = getNextOnboardingChips(requirements.progress, true);
    const progressText = buildProgressIndicator(requirements.progress);

    const a = await pushMessage(
      session_id,
      "assistant",
      `✅ Super! Instagram je uspješno povezan! 🎉\n\nPokrećem analizu tvojih objava u pozadini...\n\n${progressText}\nU međuvremenu, reci mi cilj tvog profila za idući mjesec:`,
      { chips }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // GLOBAL: Handle onboarding answers from any step
  // =========================
  
  // Goal answer
  if (norm.startsWith("cilj:") || (!state.goal && (
    norm.includes("engagement") || norm.includes("branding") || 
    norm.includes("promocij") || norm.includes("mix")
  ))) {
    const goal = norm.replace("cilj:", "").trim() || norm;
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, goal, step: "onboarding" }), session_id]
    );

    const requirements = await checkProgress(PROJECT_ID, { ...state, goal });
    const chips = getNextOnboardingChips(requirements.progress, ig_connected);
    const progressText = buildProgressIndicator(requirements.progress);

    let nextQuestion = "Koji tip profila te najbolje opisuje?";
    if (requirements.progress.has_profile_type) {
      nextQuestion = "Na što se fokusiramo u idućih 30 dana?";
    }

    const a = await pushMessage(
      session_id,
      "assistant",
      `✅ Cilj zabilježen: ${goal}\n\n${progressText}\n${nextQuestion}`,
      { chips }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // Profile type answer
  if (norm.startsWith("profil:") || (!state.profile_type && (
    norm.includes("product") || norm.includes("lifestyle") || 
    norm.includes("creator") || norm.includes("content")
  ))) {
    let profileType = "product_brand";
    if (norm.includes("lifestyle")) profileType = "lifestyle";
    else if (norm.includes("creator")) profileType = "creator";
    else if (norm.includes("content") || norm.includes("media")) profileType = "content_media";

    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, profile_type: profileType, step: "onboarding" }), session_id]
    );

    const requirements = await checkProgress(PROJECT_ID, { ...state, profile_type: profileType });
    const chips = getNextOnboardingChips(requirements.progress, ig_connected);
    const progressText = buildProgressIndicator(requirements.progress);

    const a = await pushMessage(
      session_id,
      "assistant",
      `✅ Tip profila: ${profileType}\n\n${progressText}\nNa što se fokusiramo u idućih 30 dana?`,
      { chips }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // Focus answer
  if (norm.startsWith("fokus:") || (!state.focus && (
    norm.includes("engagement") || norm.includes("rast") || norm.includes("growth") ||
    norm.includes("promocij") || norm.includes("storytelling")
  ))) {
    const focus = norm.replace("fokus:", "").trim() || norm;
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, focus, step: "onboarding" }), session_id]
    );

    const requirements = await checkProgress(PROJECT_ID, { ...state, focus });
    const chips = getNextOnboardingChips(requirements.progress, ig_connected);
    const progressText = buildProgressIndicator(requirements.progress);

    let message = `✅ Fokus: ${focus}\n\n${progressText}\n`;

    if (requirements.canGenerate) {
      message += "🎉 Sve je spremno! Možeš pokrenuti generiranje.";
    } else if (requirements.progress.has_products && !requirements.progress.has_confirmed_products) {
      message += "Sada potvrdi proizvode koje želiš koristiti.";
    } else if (!requirements.progress.has_reference_image && !requirements.progress.has_products) {
      message += "Trebam još vizualnu referencu (sliku ili proizvod).";
    }

    const a = await pushMessage(session_id, "assistant", message, { chips });
    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // GLOBAL COMMANDS
  // =========================

  // Prikaži proizvode
  if (norm.includes("prikaži") && norm.includes("proizvod")) {
    const pendingProducts = await getPendingProducts(PROJECT_ID);

    if (pendingProducts.length === 0) {
      const requirements = await checkProgress(PROJECT_ID, state);
      const chips = getNextOnboardingChips(requirements.progress, ig_connected);

      const a = await pushMessage(
        session_id,
        "assistant",
        "Nema pronađenih proizvoda za potvrdu. " + 
        (ig_connected ? "Čekam završetak analize..." : "Poveži Instagram ili uploaj slike."),
        { chips }
      );
      return NextResponse.json({ new_messages: [a] });
    }

    const chips = buildProductChips(pendingProducts);
    const a = await pushMessage(
      session_id,
      "assistant",
      `🏷️ Pronađeno ${pendingProducts.length} proizvoda. Klikni za potvrdu:\n\n${pendingProducts.map((p: any) => `• ${p.product_name}`).join('\n')}\n\nNakon odabira klikni "Nastavi".`,
      { chips }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // Potvrdi sve proizvode
  if (norm.includes("potvrdi sve")) {
    await q(
      `UPDATE detected_products SET status = 'confirmed' WHERE project_id = $1 AND status = 'pending'`,
      [PROJECT_ID]
    );

    const requirements = await checkProgress(PROJECT_ID, state);
    const chips = getNextOnboardingChips(requirements.progress, ig_connected);
    const progressText = buildProgressIndicator(requirements.progress);

    let message = `✅ Svi proizvodi potvrđeni!\n\n${progressText}\n`;
    if (requirements.canGenerate) {
      message += "🎉 Spremno za generiranje!";
    }

    const a = await pushMessage(session_id, "assistant", message, { chips });
    return NextResponse.json({ new_messages: [a] });
  }

  // Nastavi s generiranjem
  if (norm.includes("nastavi") && (norm.includes("generiranj") || norm.includes("dalje"))) {
    const requirements = await checkProgress(PROJECT_ID, state);

    if (!requirements.canGenerate) {
      const chips = getNextOnboardingChips(requirements.progress, ig_connected);
      const progressText = buildProgressIndicator(requirements.progress);

      let message = `⚠️ Još ne mogu generirati.\n\n${progressText}\n`;
      if (!requirements.progress.has_goal) {
        message += "Reci mi cilj tvog profila:";
      } else if (!requirements.progress.has_profile_type) {
        message += "Koji tip profila te opisuje?";
      } else if (!requirements.progress.has_focus) {
        message += "Na što se fokusiramo?";
      } else {
        message += "Nedostaje: " + requirements.missing.join(", ");
      }

      const a = await pushMessage(session_id, "assistant", message, { chips });
      return NextResponse.json({ new_messages: [a] });
    }

    const a = await pushMessage(
      session_id,
      "assistant",
      `✅ Sve spremno!\n\nPokrećem generiranje plana?`,
      {
        chips: [
          { type: "suggestion", label: "🚀 Da, generiraj!", value: "generiraj plan sada" },
          { type: "suggestion", label: "Prikaži proizvode", value: "prikaži proizvode" }
        ]
      }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // Generiraj plan
  if (norm.includes("generiraj") || norm.includes("generate")) {
    const requirements = await checkProgress(PROJECT_ID, state);
    const userConfirmed = norm.includes("sada") || norm.includes("da");

    if (!requirements.canGenerate) {
      const chips = getNextOnboardingChips(requirements.progress, ig_connected);
      const progressText = buildProgressIndicator(requirements.progress);

      let message = `⚠️ Još ne mogu generirati.\n\n${progressText}\n`;
      
      if (!requirements.progress.has_goal) {
        message += "Reci mi cilj tvog profila za idući mjesec:";
      } else if (!requirements.progress.has_profile_type) {
        message += "Koji tip profila te najbolje opisuje?";
      } else if (!requirements.progress.has_focus) {
        message += "Na što se fokusiramo u idućih 30 dana?";
      } else if (requirements.progress.has_products && !requirements.progress.has_confirmed_products) {
        message += "Potvrdi proizvode koje želiš koristiti.";
      } else {
        message += "Nedostaje: " + requirements.missing.join(", ");
      }

      const a = await pushMessage(session_id, "assistant", message, { chips });
      return NextResponse.json({ new_messages: [a] });
    }

    if (!userConfirmed) {
      await q(
        `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
        [JSON.stringify({ ...state, step: "ready_to_generate" }), session_id]
      );

      const a = await pushMessage(
        session_id,
        "assistant",
        `✅ Sve spremno!\n\nPokrećem generiranje?`,
        {
          chips: [
            { type: "suggestion", label: "🚀 Da, generiraj!", value: "generiraj plan sada" },
            { type: "suggestion", label: "Prikaži proizvode", value: "prikaži proizvode" }
          ]
        }
      );

      return NextResponse.json({ new_messages: [a] });
    }

    // Execute generation
    const month = new Date().toISOString().slice(0, 7);
    await qLLM.add("plan.generate", {
      project_id: PROJECT_ID,
      month,
      limit: state.horizon === 7 ? 7 : null
    });

    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, step: "generating" }), session_id]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      `🎉 Generiram plan za ${month}!\n\n• Planiranje sadržaja\n• Pisanje captiona\n• Generiranje vizuala\n\nDobit ćeš obavijest kad bude gotovo.`,
      { chips: [{ type: "navigation", label: "Otvori Calendar", href: "/calendar" }] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // Export
  if (norm.includes("export")) {
    await qExport.add("export.pack", { project_id: PROJECT_ID, approved_only: true });
    const a = await pushMessage(
      session_id,
      "assistant",
      "Pripremam export. Otvori Export page za download.",
      { chips: [{ type: "navigation", label: "Otvori Export", href: "/export" }] }
    );
    return NextResponse.json({ new_messages: [a] });
  }

  // Connect Instagram - only if not already connected
  if (norm.includes("pove") && norm.includes("insta")) {
    if (ig_connected) {
      const a = await pushMessage(
        session_id,
        "assistant",
        "✅ Instagram je već povezan! Analiza je u tijeku.\n\nU međuvremenu, odgovori na nekoliko pitanja:",
        { chips: getNextOnboardingChips((await checkProgress(PROJECT_ID, state)).progress, true) }
      );
      return NextResponse.json({ new_messages: [a] });
    }

    const a = await pushMessage(
      session_id,
      "assistant",
      "Otvori Settings i klikni \"Connect Instagram\".",
      { chips: [{ type: "navigation", label: "Otvori Settings", href: "/settings" }] }
    );
    return NextResponse.json({ new_messages: [a] });
  }

  // Web stranica / website URL
  if (norm.includes("web") && (norm.includes("stranic") || norm.includes("site"))) {
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, step: "website_input" }), session_id]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      "Unesi URL svoje web stranice (npr. www.mojafirma.hr):",
      { chips: [] }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // SPECIFIC UPLOAD HANDLERS (must be BEFORE general upload handler!)
  // =========================

  // Upload stil reference - MUST CHECK FIRST
  if (norm.includes("upload stil") || norm === "🎨 stil reference" ||
      (step === "upload_reference" && norm.includes("stil"))) {
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, step: "upload_style_reference", upload_type: "style_reference" }), session_id]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      `🎨 **Stil reference**\n\nUploadaj slike koje definiraju vizualni stil:\n• Mood i atmosfera\n• Boje i tonovi\n• Kompozicija\n\n💡 Savjet: Koristi slike s Instagram profila koji ti se sviđa.\n\n📎 Povuci sliku ovdje ili koristi gumb ispod:`,
      {
        chips: [
          { type: "file_upload", label: "📤 Odaberi sliku", accept: "image/*", uploadType: "style_reference" },
          { type: "suggestion", label: "⬅️ Natrag", value: "uploaj slike" },
          { type: "suggestion", label: "Preskoči", value: "preskoči reference" }
        ]
      }
    );
    return NextResponse.json({ new_messages: [a] });
  }

  // Upload proizvod reference - MUST CHECK FIRST
  if (norm.includes("upload proizvod") || norm === "📦 proizvodi" ||
      (step === "upload_reference" && norm.includes("proizvod"))) {
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, step: "upload_product_reference", upload_type: "product_reference" }), session_id]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      `📦 **Proizvodi**\n\nUploadaj slike proizvoda koje želiš da AI uključi u generirani sadržaj.\n\n💡 Savjet: Koristi čiste slike na bijeloj pozadini za najbolje rezultate.\n\n📎 Povuci sliku ovdje ili koristi gumb ispod:`,
      {
        chips: [
          { type: "file_upload", label: "📤 Odaberi sliku", accept: "image/*", uploadType: "product_reference" },
          { type: "suggestion", label: "⬅️ Natrag", value: "uploaj slike" },
          { type: "suggestion", label: "Preskoči", value: "preskoči reference" }
        ]
      }
    );
    return NextResponse.json({ new_messages: [a] });
  }

  // Upload lik reference - MUST CHECK FIRST
  if (norm.includes("upload lik") || norm === "👤 likovi" ||
      (step === "upload_reference" && (norm.includes("lik") || norm.includes("character")))) {
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, step: "upload_character_reference", upload_type: "character_reference" }), session_id]
    );

    const a = await pushMessage(
      session_id,
      "assistant",
      `👤 **Likovi / Osobe**\n\nUploadaj slike osoba ili maskota koje želiš konzistentno prikazivati.\n\n💡 Savjet: Uploadaj više slika iste osobe iz različitih kutova.\n\n📎 Povuci sliku ovdje ili koristi gumb ispod:`,
      {
        chips: [
          { type: "file_upload", label: "📤 Odaberi sliku", accept: "image/*", uploadType: "character_reference" },
          { type: "suggestion", label: "⬅️ Natrag", value: "uploaj slike" },
          { type: "suggestion", label: "Preskoči", value: "preskoči reference" }
        ]
      }
    );
    return NextResponse.json({ new_messages: [a] });
  }

  // Preskoči reference - MUST CHECK BEFORE general upload handler
  if (norm.includes("preskoči") || norm.includes("skip") || 
      (step === "upload_reference" && (norm.includes("dalje") || norm.includes("nastavi")))) {
    const requirements = await checkProgress(PROJECT_ID, state);
    const chips = getNextOnboardingChips(requirements.progress, ig_connected);
    const progressText = buildProgressIndicator(requirements.progress);

    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, step: "onboarding", references_skipped: true }), session_id]
    );

    let message = `Ok, možeš uploadati reference kasnije.\n\n${progressText}\n`;
    if (requirements.canGenerate) {
      message += "🎉 Sve je spremno! Možeš pokrenuti generiranje.";
    } else if (!requirements.progress.has_goal) {
      message += "Reci mi cilj tvog profila:";
    } else if (!requirements.progress.has_profile_type) {
      message += "Koji tip profila te opisuje?";
    } else if (!requirements.progress.has_focus) {
      message += "Na što se fokusiramo?";
    }

    const a = await pushMessage(session_id, "assistant", message, { chips });
    return NextResponse.json({ new_messages: [a] });
  }

  // Prikaži reference za brisanje
  if (norm.includes("prikaži reference") || norm.includes("obriši reference")) {
    const assets = await q<any>(
      `SELECT id, url, label, created_at FROM assets 
       WHERE project_id = $1 AND label IN ('style_reference', 'product_reference', 'character_reference')
       ORDER BY label, created_at DESC`,
      [PROJECT_ID]
    );

    if (assets.length === 0) {
      const a = await pushMessage(
        session_id,
        "assistant",
        "Nemaš uploadanih referenci.",
        { chips: [{ type: "suggestion", label: "Uploaj slike", value: "uploaj slike" }] }
      );
      return NextResponse.json({ new_messages: [a] });
    }

    const chips: any[] = assets.map((a: any) => ({
      type: "asset_delete",
      label: `🗑️ ${a.label.replace('_reference', '')}: ${a.id.slice(-6)}`,
      assetId: a.id
    }));

    chips.push({ type: "suggestion", label: "⬅️ Natrag", value: "uploaj slike" });

    const a = await pushMessage(
      session_id,
      "assistant",
      `🗑️ **Obriši reference**\n\nKlikni na referencu koju želiš obrisati:\n\n${assets.map((a: any) => `• ${a.label.replace('_reference', '')}: ...${a.id.slice(-8)}`).join('\n')}`,
      { chips }
    );
    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // GENERAL UPLOAD HANDLER (must be AFTER specific handlers!)
  // =========================
  // Uploaj slike / Reference - GENERAL MENU
  if (norm.includes("uploaj") || (norm.includes("upload") && !norm.includes("stil") && !norm.includes("proizvod") && !norm.includes("lik"))) {
    // Dohvati trenutne reference
    const refs = await q<any>(
      `SELECT label, COUNT(*) as count FROM assets 
       WHERE project_id = $1 AND label IN ('style_reference', 'product_reference', 'character_reference')
       GROUP BY label`,
      [PROJECT_ID]
    );

    const refCounts: Record<string, number> = {};
    refs.forEach((r: any) => { refCounts[r.label] = parseInt(r.count); });

    const styleCount = refCounts['style_reference'] || 0;
    const productCount = refCounts['product_reference'] || 0;
    const characterCount = refCounts['character_reference'] || 0;
    const totalCount = styleCount + productCount + characterCount;

    let message = `📸 **Reference za generiranje**\n\n`;
    message += `Reference pomažu AI-u da bolje razumije tvoj stil i proizvode.\n\n`;
    message += `Trenutno imaš:\n`;
    message += `• Stil reference: ${styleCount}/5\n`;
    message += `• Proizvodi: ${productCount}/5\n`;
    message += `• Likovi: ${characterCount}/5\n`;
    message += `\n📊 Ukupno: ${totalCount}/8 (koristi se max 8 pri generiranju)\n\n`;
    message += `Odaberi što želiš uploadati:`;

    const chips: any[] = [
      { type: "suggestion", label: "🎨 Stil reference", value: "upload stil" },
      { type: "suggestion", label: "📦 Proizvodi", value: "upload proizvod" },
      { type: "suggestion", label: "👤 Likovi", value: "upload lik" }
    ];

    if (totalCount > 0) {
      chips.push({ type: "suggestion", label: "🗑️ Obriši reference", value: "prikaži reference za brisanje" });
    }

    chips.push({ type: "suggestion", label: "Preskoči", value: "preskoči reference" });

    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ ...state, step: "upload_reference" }), session_id]
    );

    const a = await pushMessage(session_id, "assistant", message, { chips });
    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // STEP 0: INIT
  // =========================
  if (step === "init") {
    // SPECIAL: Handle "Instagram spojen!" from OAuth callback
    if (norm.includes("spojen") || norm.includes("connected") || norm.includes("uspješno")) {
      // Always move to onboarding after IG connection
      await q(
        `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
        [JSON.stringify({ ...state, step: "onboarding", ig_connected: true }), session_id]
      );

      const requirements = await checkProgress(PROJECT_ID, { ...state, ig_connected: true });
      const chips = getNextOnboardingChips(requirements.progress, true);
      const progressText = buildProgressIndicator(requirements.progress);

      const a = await pushMessage(
        session_id,
        "assistant",
        `✅ Super! Instagram je uspješno povezan! 🎉\n\nPokrećem analizu tvojih objava u pozadini...\n\n${progressText}\nU međuvremenu, reci mi cilj tvog profila za idući mjesec:`,
        { chips }
      );

      return NextResponse.json({ new_messages: [a] });
    }

    // Spoji Instagram
    if (norm.includes("spoji") || norm.includes("connect")) {
      if (ig_connected) {
        await q(
          `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
          [JSON.stringify({ ...state, step: "onboarding" }), session_id]
        );

        const requirements = await checkProgress(PROJECT_ID, state);
        const chips = getNextOnboardingChips(requirements.progress, true);
        const progressText = buildProgressIndicator(requirements.progress);

        const a = await pushMessage(
          session_id,
          "assistant",
          `✅ Instagram je već povezan! Analiza je u tijeku.\n\n${progressText}\nReci mi cilj tvog profila za idući mjesec:`,
          { chips }
        );

        return NextResponse.json({ new_messages: [a] });
      }

      const a = await pushMessage(
        session_id,
        "assistant",
        "Otvori Settings i klikni \"Connect Instagram\".",
        { chips: [{ type: "navigation", label: "Otvori Settings", href: "/settings" }] }
      );

      return NextResponse.json({ new_messages: [a] });
    }

    // Nastavi bez Instagrama
    if (norm.includes("nastavi") || norm.includes("bez") || norm.includes("skip")) {
      await q(
        `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
        [JSON.stringify({ ...state, step: "no_instagram_options", no_instagram: true }), session_id]
      );

      const a = await pushMessage(
        session_id,
        "assistant",
        "Ok! Bez Instagrama možeš:\n\n1. **Web stranica** - unesi URL stranice za analizu firme\n2. **Uploaj slike** - ručni upload referentnih slika",
        {
          chips: [
            { type: "suggestion", label: "Unesi web stranicu", value: "web stranica" },
            { type: "suggestion", label: "Uploaj slike", value: "uploaj slike" }
          ]
        }
      );

      return NextResponse.json({ new_messages: [a] });
    }

    // Check if user typed an Instagram username directly
    const username = extractInstagramUsername(text);
    if (username) {
      return handleScraping(session_id, state, username, ig_connected);
    }

    // Default — only 2 options, no "Brzi pregled"
    const a = await pushMessage(
      session_id,
      "assistant",
      "Odaberi kako želiš započeti:",
      {
        chips: [
          { type: "suggestion", label: "Spoji Instagram", value: "spoji instagram" },
          { type: "suggestion", label: "Nastavi bez Instagrama", value: "nastavi bez" }
        ]
      }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // STEP: NO INSTAGRAM OPTIONS
  // =========================
  if (step === "no_instagram_options") {
    // Default — web stranica + uploaj slike (no "Brzi pregled")
    const a = await pushMessage(
      session_id,
      "assistant",
      "Odaberi opciju:",
      {
        chips: [
          { type: "suggestion", label: "Unesi web stranicu", value: "web stranica" },
          { type: "suggestion", label: "Uploaj slike", value: "uploaj slike" }
        ]
      }
    );

    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // STEP: SCRAPE INPUT
  // =========================
  if (step === "scrape_input") {
    const username = extractInstagramUsername(text);
    if (!username) {
      const a = await pushMessage(
        session_id,
        "assistant",
        "Nisam prepoznao username. Format: @username ili instagram.com/username",
        { chips: [] }
      );
      return NextResponse.json({ new_messages: [a] });
    }

    return handleScraping(session_id, state, username, ig_connected);
  }

  // =========================
  // STEP: WEBSITE INPUT
  // =========================
  if (step === "website_input") {
    const url = extractWebsiteUrl(text);
    if (!url) {
      const a = await pushMessage(
        session_id,
        "assistant",
        "Nisam prepoznao URL. Format: www.example.com ili https://example.com",
        { chips: [] }
      );
      return NextResponse.json({ new_messages: [a] });
    }

    // Pokreni web scraping
    log("chat:website", "scraping_start", { url });
    
    const scrapedData = await scrapeWebsite(url);
    
    await q(
      `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
      [JSON.stringify({ 
        ...state, 
        website_url: url, 
        website_data: scrapedData,
        step: "onboarding" 
      }), session_id]
    );

    log("chat:website", "scraping_complete", { url, success: scrapedData.success });

    const requirements = await checkProgress(PROJECT_ID, { ...state, website_url: url });
    const chips = getNextOnboardingChips(requirements.progress, ig_connected);
    const progressText = buildProgressIndicator(requirements.progress);

    let responseText = "";
    if (scrapedData.success && scrapedData.data) {
      const d = scrapedData.data;
      responseText = `✅ **Web stranica analizirana!**\n\n`;
      responseText += `🌐 ${url}\n\n`;
      if (d.title) responseText += `📌 ${d.title}\n`;
      if (d.description) responseText += `📝 ${d.description}\n`;
      if (d.products && d.products.length > 0) {
        responseText += `\n🏷️ Pronađeni proizvodi/kategorije:\n`;
        d.products.slice(0, 5).forEach((p: string) => {
          responseText += `• ${p}\n`;
        });
      }
      if (d.colors && d.colors.length > 0) {
        responseText += `\n🎨 Dominantne boje: ${d.colors.join(", ")}\n`;
      }
      responseText += `\n${progressText}\nReci mi cilj tvog profila za idući mjesec:`;
    } else {
      responseText = `✅ Web stranica zabilježena: ${url}\n\n`;
      responseText += `⚠️ Nisam mogao dohvatiti detalje sa stranice, ali možemo nastaviti.\n\n`;
      responseText += `${progressText}\nReci mi cilj tvog profila za idući mjesec:`;
    }

    const a = await pushMessage(session_id, "assistant", responseText, { chips });
    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // STEP: SCRAPE COMPLETE
  // =========================
  if (step === "scrape_complete") {
    if (norm.includes("da") || norm.includes("nastavi")) {
      await q(
        `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
        [JSON.stringify({ ...state, step: "onboarding" }), session_id]
      );

      const requirements = await checkProgress(PROJECT_ID, state);
      const chips = getNextOnboardingChips(requirements.progress, ig_connected);
      const progressText = buildProgressIndicator(requirements.progress);

      const a = await pushMessage(
        session_id,
        "assistant",
        `Odlično!\n\n${progressText}\nReci mi cilj tvog profila za idući mjesec:`,
        { chips }
      );

      return NextResponse.json({ new_messages: [a] });
    }
  }

  // =========================
  // STEP: ONBOARDING
  // =========================
  if (step === "onboarding" || step === "ready_to_generate" || step === "pre_generate") {
    const requirements = await checkProgress(PROJECT_ID, state);
    const chips = getNextOnboardingChips(requirements.progress, ig_connected);
    const progressText = buildProgressIndicator(requirements.progress);

    let message = `${progressText}\n`;
    if (!requirements.progress.has_goal) {
      message += "Reci mi cilj tvog profila za idući mjesec:";
    } else if (!requirements.progress.has_profile_type) {
      message += "Koji tip profila te najbolje opisuje?";
    } else if (!requirements.progress.has_focus) {
      message += "Na što se fokusiramo u idućih 30 dana?";
    } else if (requirements.canGenerate) {
      message += "Sve je spremno! Pokreni generiranje.";
    } else {
      message += "Nastavi s onboardingom.";
    }

    const a = await pushMessage(session_id, "assistant", message, { chips });
    return NextResponse.json({ new_messages: [a] });
  }

  // =========================
  // DEFAULT
  // =========================
  const requirements = await checkProgress(PROJECT_ID, state);
  const chips = getNextOnboardingChips(requirements.progress, ig_connected);

  const a = await pushMessage(
    session_id,
    "assistant",
    "Mogu:\n• \"generiraj plan\"\n• \"prikaži proizvode\"\n• \"nastavi\" s onboardingom",
    { chips }
  );

  return NextResponse.json({ new_messages: [a] });
}

// ============================================================
// Helper: Handle scraping flow
// ============================================================
async function handleScraping(
  session_id: string,
  state: any,
  username: string,
  ig_connected: boolean
) {
  const scrapeResult = await performScraping(username);

  let responseText: string;
  let chips: any[];

  if (scrapeResult.success && scrapeResult.data) {
    const d = scrapeResult.data;

    if (scrapeResult.source === "instagram" && !scrapeResult.needsMoreInfo) {
      responseText = `📊 **Profil @${username}**\n\n`;
      if (d.full_name) responseText += `👤 ${d.full_name}\n`;
      if (d.followers) responseText += `👥 Pratitelji: ${d.followers}\n`;
      if (d.posts_count) responseText += `📸 Objava: ${d.posts_count}\n`;
      if (d.bio) responseText += `\n📝 ${d.bio}\n`;
      responseText += `\nŽeliš li nastaviti s ovim profilom?`;

      chips = [
        { type: "suggestion", label: "Da, nastavi", value: "nastavi" },
        { type: "suggestion", label: "Unesi web stranicu za više info", value: "web stranica" }
      ];

      if (!ig_connected) {
        chips.push({ type: "suggestion", label: "Spoji Instagram", value: "spoji instagram" });
      }
    } else {
      responseText = `📊 **Analiza @${username}**\n\n`;
      if (d.estimated_niche) responseText += `🎯 Procijenjeni niche: ${d.estimated_niche}\n`;
      if (d.estimated_style) responseText += `🎨 Procijenjeni stil: ${d.estimated_style}\n`;
      if (d.followers) responseText += `👥 Pratitelji: ${d.followers}\n`;
      responseText += `\n⚠️ Nisam pronašao sve informacije. Za bolje rezultate:`;

      chips = [
        { type: "suggestion", label: "Unesi web stranicu", value: "web stranica" },
        { type: "suggestion", label: "Nastavi bez dodatnih info", value: "nastavi" }
      ];

      if (!ig_connected) {
        chips.push({ type: "suggestion", label: "Spoji Instagram", value: "spoji instagram" });
      }
    }
  } else {
    responseText = `Nisam uspio dohvatiti podatke za @${username}.\n\nProfil je možda privatan ili ne postoji.`;
    chips = [
      { type: "suggestion", label: "Unesi web stranicu", value: "web stranica" }
    ];

    if (!ig_connected) {
      chips.push({ type: "suggestion", label: "Spoji Instagram", value: "spoji instagram" });
    }

    chips.push({ type: "suggestion", label: "Nastavi bez analize", value: "nastavi bez" });
  }

  await q(
    `UPDATE chat_sessions SET state=$1 WHERE id=$2`,
    [JSON.stringify({ ...state, step: "scrape_complete", username, scrape_result: scrapeResult }), session_id]
  );

  const a = await pushMessage(session_id, "assistant", responseText, { chips });
  return NextResponse.json({ new_messages: [a] });
}
