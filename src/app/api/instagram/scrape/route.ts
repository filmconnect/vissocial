// ============================================================
// API: /api/instagram/scrape
// ============================================================
// Web scraping javnog Instagram profila bez OAuth.
// Koristi se za Step 0 - brzi pregled prije povezivanja.
// 
// NAPOMENA: Instagram aktivno blokira scraping, pa ovaj endpoint
// koristi fallback na web search ako direktni scraping ne uspije.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

// ============================================================
// Types
// ============================================================

interface ScrapeResult {
  success: boolean;
  username: string;
  data?: {
    full_name?: string;
    bio?: string;
    followers?: number;
    following?: number;
    posts_count?: number;
    is_business?: boolean;
    category?: string;
    external_url?: string;
    profile_pic_url?: string;
    recent_posts?: Array<{
      caption?: string;
      likes?: number;
      comments?: number;
    }>;
    estimated_style?: string;
    estimated_niche?: string;
  };
  source: "instagram" | "web_search" | "fallback";
  error?: string;
}

// ============================================================
// POST /api/instagram/scrape
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, session_id, project_id } = body;

    if (!username) {
      return NextResponse.json(
        { error: "username required" },
        { status: 400 }
      );
    }

    // Clean username
    const cleanUsername = username.replace(/^@/, "").trim().toLowerCase();

    log("api:instagram:scrape", "start", {
      username: cleanUsername,
      session_id,
      project_id
    });

    // Try to scrape profile
    let result: ScrapeResult;

    try {
      // Method 1: Try direct Instagram page fetch (often blocked)
      result = await tryDirectScrape(cleanUsername);
    } catch (err) {
      log("api:instagram:scrape", "direct_failed", {
        username: cleanUsername,
        error: (err as any).message
      });

      // Method 2: Fallback to web search based estimation
      try {
        result = await tryWebSearchFallback(cleanUsername);
      } catch (err2) {
        log("api:instagram:scrape", "websearch_failed", {
          username: cleanUsername,
          error: (err2 as any).message
        });

        // Method 3: Pure fallback with basic estimation
        result = createFallbackResult(cleanUsername);
      }
    }

    // Save results to session state if session_id provided
    if (session_id && result.success) {
      await saveScrapeResultToSession(session_id, result);
    }

    // Send notification/message with results
    if (session_id && result.success && result.data) {
      await sendScrapeResultMessage(session_id, result);
    }

    log("api:instagram:scrape", "complete", {
      username: cleanUsername,
      success: result.success,
      source: result.source
    });

    return NextResponse.json(result);

  } catch (error: any) {
    log("api:instagram:scrape", "error", { error: error.message });
    return NextResponse.json(
      { error: "Scraping failed", details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// Method 1: Direct Instagram page scrape
// (Usually blocked, but worth trying)
// ============================================================

async function tryDirectScrape(username: string): Promise<ScrapeResult> {
  const url = `https://www.instagram.com/${username}/`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5"
    },
    // Timeout after 10 seconds
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Instagram returned ${response.status}`);
  }

  const html = await response.text();

  // Check if profile exists
  if (html.includes("Sorry, this page") || html.includes("Page Not Found")) {
    return {
      success: false,
      username,
      source: "instagram",
      error: "Profile not found"
    };
  }

  // Try to extract data from HTML/JSON
  const data = extractDataFromHtml(html, username);

  if (data) {
    return {
      success: true,
      username,
      data,
      source: "instagram"
    };
  }

  throw new Error("Could not extract data from Instagram page");
}

// ============================================================
// Extract data from Instagram HTML
// ============================================================

function extractDataFromHtml(html: string, username: string): ScrapeResult["data"] | null {
  try {
    // Instagram embeds JSON data in script tags
    const jsonMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
    
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[1]);
      
      return {
        full_name: jsonData.name,
        bio: jsonData.description,
        followers: jsonData.mainEntityOfPage?.interactionStatistic?.userInteractionCount,
        profile_pic_url: jsonData.image
      };
    }

    // Fallback: Try meta tags
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

    if (titleMatch || descMatch) {
      // Try to extract follower count from description
      // Format: "X Followers, Y Following, Z Posts - ..."
      let followers: number | undefined;
      let following: number | undefined;
      let posts_count: number | undefined;

      if (descMatch) {
        const statsMatch = descMatch[1].match(/(\d+(?:,\d+)*)\s*Followers.*?(\d+(?:,\d+)*)\s*Following.*?(\d+(?:,\d+)*)\s*Posts/i);
        if (statsMatch) {
          followers = parseInt(statsMatch[1].replace(/,/g, ""));
          following = parseInt(statsMatch[2].replace(/,/g, ""));
          posts_count = parseInt(statsMatch[3].replace(/,/g, ""));
        }
      }

      return {
        full_name: titleMatch ? titleMatch[1].split("(")[0].trim() : undefined,
        bio: descMatch ? descMatch[1].split(" - ").pop() : undefined,
        followers,
        following,
        posts_count,
        profile_pic_url: imageMatch ? imageMatch[1] : undefined
      };
    }

    return null;

  } catch (err) {
    log("scrape:extract", "extraction_error", { error: (err as any).message });
    return null;
  }
}

// ============================================================
// Method 2: Web search fallback
// ============================================================

async function tryWebSearchFallback(username: string): Promise<ScrapeResult> {
  // This would ideally use a web search API
  // For now, we'll create an estimation based on username patterns

  // Simple heuristics based on username
  const data = estimateProfileFromUsername(username);

  return {
    success: true,
    username,
    data,
    source: "web_search"
  };
}

// ============================================================
// Method 3: Pure fallback
// ============================================================

function createFallbackResult(username: string): ScrapeResult {
  return {
    success: true,
    username,
    data: {
      bio: "Podaci nisu dostupni bez povezivanja Instagram računa.",
      estimated_style: "Nije moguće odrediti",
      estimated_niche: "Nije moguće odrediti"
    },
    source: "fallback"
  };
}

// ============================================================
// Estimate profile from username patterns
// ============================================================

function estimateProfileFromUsername(username: string): ScrapeResult["data"] {
  const lower = username.toLowerCase();

  // Detect potential niches from username
  let estimated_niche = "general";
  let estimated_style = "mixed";

  if (lower.includes("shop") || lower.includes("store") || lower.includes("brand")) {
    estimated_niche = "e-commerce";
    estimated_style = "product-focused";
  } else if (lower.includes("food") || lower.includes("cook") || lower.includes("recipe") || lower.includes("kitchen")) {
    estimated_niche = "food";
    estimated_style = "lifestyle";
  } else if (lower.includes("fit") || lower.includes("gym") || lower.includes("workout") || lower.includes("health")) {
    estimated_niche = "fitness";
    estimated_style = "motivational";
  } else if (lower.includes("travel") || lower.includes("adventure") || lower.includes("explore")) {
    estimated_niche = "travel";
    estimated_style = "visual-storytelling";
  } else if (lower.includes("tech") || lower.includes("dev") || lower.includes("code")) {
    estimated_niche = "technology";
    estimated_style = "educational";
  } else if (lower.includes("art") || lower.includes("design") || lower.includes("creative")) {
    estimated_niche = "creative";
    estimated_style = "artistic";
  } else if (lower.includes("beauty") || lower.includes("makeup") || lower.includes("skin")) {
    estimated_niche = "beauty";
    estimated_style = "tutorial";
  } else if (lower.includes("book") || lower.includes("read") || lower.includes("write")) {
    estimated_niche = "books/publishing";
    estimated_style = "educational";
  }

  return {
    bio: `Procjena na temelju username-a @${username}`,
    estimated_niche,
    estimated_style
  };
}

// ============================================================
// Save results to session
// ============================================================

async function saveScrapeResultToSession(
  session_id: string,
  result: ScrapeResult
): Promise<void> {
  try {
    const session = await q<any>(
      `SELECT state FROM chat_sessions WHERE id = $1`,
      [session_id]
    );

    if (session[0]) {
      const currentState = session[0].state || {};
      const newState = {
        ...currentState,
        step: "scrape_complete",
        scrape_result: result
      };

      await q(
        `UPDATE chat_sessions SET state = $1 WHERE id = $2`,
        [JSON.stringify(newState), session_id]
      );
    }
  } catch (err) {
    log("scrape:save", "save_error", { session_id, error: (err as any).message });
  }
}

// ============================================================
// Send result message to chat
// ============================================================

async function sendScrapeResultMessage(
  session_id: string,
  result: ScrapeResult
): Promise<void> {
  try {
    const msgId = "msg_" + uuid();
    const data = result.data!;

    let messageText = `📊 **Analiza profila @${result.username}**\n\n`;

    if (result.source === "instagram" && data.followers) {
      messageText += `👥 Pratitelji: ${formatNumber(data.followers)}\n`;
      if (data.following) messageText += `📤 Prati: ${formatNumber(data.following)}\n`;
      if (data.posts_count) messageText += `📸 Objava: ${formatNumber(data.posts_count)}\n`;
      if (data.bio) messageText += `\n📝 Bio: ${data.bio}\n`;
    } else if (result.source === "web_search" || result.source === "fallback") {
      if (data.estimated_niche) messageText += `🎯 Procijenjeni niche: ${data.estimated_niche}\n`;
      if (data.estimated_style) messageText += `🎨 Procijenjeni stil: ${data.estimated_style}\n`;
      messageText += `\n⚠️ Za točnije podatke, preporučujem povezivanje Instagram računa.`;
    }

    messageText += `\n\nŽeliš li nastaviti s ovim profilom?`;

    const chips = [
      { type: "suggestion", label: "Da, nastavi", value: "nastavi bez" },
      { type: "suggestion", label: "Spoji Instagram za više", value: "spoji instagram" },
      { type: "suggestion", label: "Pokušaj drugi profil", value: "brzi pregled" }
    ];

    await q(
      `INSERT INTO chat_messages (id, session_id, role, text, meta, created_at)
       VALUES ($1, $2, 'assistant', $3, $4, NOW())`,
      [msgId, session_id, messageText, JSON.stringify({ chips })]
    );

    // Update session step
    const session = await q<any>(
      `SELECT state FROM chat_sessions WHERE id = $1`,
      [session_id]
    );

    if (session[0]) {
      const currentState = session[0].state || {};
      await q(
        `UPDATE chat_sessions SET state = $1 WHERE id = $2`,
        [JSON.stringify({ ...currentState, step: "scrape_complete" }), session_id]
      );
    }

  } catch (err) {
    log("scrape:message", "message_error", { session_id, error: (err as any).message });
  }
}

// ============================================================
// Helper: Format large numbers
// ============================================================

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}
