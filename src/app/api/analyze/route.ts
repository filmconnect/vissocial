// ============================================================
// API: /api/analyze
// ============================================================
// Unified brand analysis endpoint.
// Accepts Instagram handle, Instagram URL, web URL, or company name.
// Phase 1: Quick data extraction (scrape/estimate)
// Phase 2: GPT brand analysis (USP, tone, audience, strategy)
//
// Returns everything in one response (no streaming).
// Timeout: 15s total, 10s for GPT.
// ============================================================

import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

// ============================================================
// TYPES
// ============================================================

type InputType = "instagram_handle" | "instagram_url" | "web_url" | "company_name";

interface BasicData {
  handle?: string;
  full_name?: string;
  bio?: string;
  followers?: number;
  following?: number;
  posts_count?: number;
  profile_pic_url?: string;
  website_url?: string;
  // Web scrape extras
  title?: string;
  description?: string;
  logo_url?: string;
  raw_text_sample?: string;
  social_links?: Record<string, string>;
  contact?: { email?: string; phone?: string };
}

interface BrandAnalysis {
  company: string;
  services: string;
  brand_tone: string;
  target_audience: string;
  language: string;
  usp_analysis: string;
  recommended_focus: string;
  strengths: string[];
  opportunities: string[];
}

interface AnalyzeResponse {
  success: boolean;
  input: string;
  input_type: InputType;
  basic: BasicData;
  analysis: BrandAnalysis | null;
}

interface AnalyzeErrorResponse {
  success: false;
  error: string;
  input: string;
}

// ============================================================
// INPUT DETECTION
// ============================================================

function detectInputType(input: string): { type: InputType; normalized: string } {
  const trimmed = input.trim();

  // Instagram URL: instagram.com/username or www.instagram.com/username
  const igUrlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?/i
  );
  if (igUrlMatch) {
    return { type: "instagram_url", normalized: igUrlMatch[1].toLowerCase() };
  }

  // Web URL: starts with http(s):// or contains common TLDs
  if (
    /^https?:\/\//i.test(trimmed) ||
    /^(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(trimmed)
  ) {
    // Make sure it's not instagram.com (already caught above)
    if (!trimmed.toLowerCase().includes("instagram.com")) {
      let url = trimmed;
      if (!url.startsWith("http")) url = "https://" + url;
      return { type: "web_url", normalized: url };
    }
  }

  // Instagram handle: starts with @ or looks like a username (no spaces, has underscore/dot)
  if (trimmed.startsWith("@")) {
    return {
      type: "instagram_handle",
      normalized: trimmed.replace(/^@/, "").toLowerCase(),
    };
  }

  // Pure username pattern: no spaces, alphanumeric with dots/underscores
  if (/^[a-zA-Z0-9._]{2,30}$/.test(trimmed) && /[._]/.test(trimmed)) {
    return { type: "instagram_handle", normalized: trimmed.toLowerCase() };
  }

  // Default: treat as company name
  return { type: "company_name", normalized: trimmed };
}

// ============================================================
// PHASE 1: Instagram Direct Scrape (copied from scrape route)
// ============================================================

async function tryDirectScrape(username: string): Promise<BasicData | null> {
  const url = `https://www.instagram.com/${username}/`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      log("analyze:ig", "http_error", { status: response.status });
      return null;
    }

    const html = await response.text();

    // Profile not found
    if (html.includes("Sorry, this page") || html.includes("Page Not Found")) {
      return null;
    }

    return extractDataFromHtml(html, username);
  } catch (err: any) {
    log("analyze:ig", "scrape_failed", { username, error: err.message });
    return null;
  }
}

// ============================================================
// Extract data from Instagram HTML (copied from scrape route)
// ============================================================

function extractDataFromHtml(html: string, username: string): BasicData | null {
  try {
    // Instagram embeds JSON data in script tags
    const jsonMatch = html.match(
      /<script type="application\/ld\+json">([^<]+)<\/script>/
    );

    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[1]);
      return {
        handle: username,
        full_name: jsonData.name,
        bio: jsonData.description,
        followers:
          jsonData.mainEntityOfPage?.interactionStatistic?.userInteractionCount,
        profile_pic_url: jsonData.image,
      };
    }

    // Fallback: Try meta tags
    const titleMatch = html.match(
      /<meta property="og:title" content="([^"]+)"/
    );
    const descMatch = html.match(
      /<meta property="og:description" content="([^"]+)"/
    );
    const imageMatch = html.match(
      /<meta property="og:image" content="([^"]+)"/
    );

    if (titleMatch || descMatch) {
      let followers: number | undefined;
      let following: number | undefined;
      let posts_count: number | undefined;
      let website_url: string | undefined;

      if (descMatch) {
        const statsMatch = descMatch[1].match(
          /(\d+(?:,\d+)*)\s*Followers.*?(\d+(?:,\d+)*)\s*Following.*?(\d+(?:,\d+)*)\s*Posts/i
        );
        if (statsMatch) {
          followers = parseInt(statsMatch[1].replace(/,/g, ""));
          following = parseInt(statsMatch[2].replace(/,/g, ""));
          posts_count = parseInt(statsMatch[3].replace(/,/g, ""));
        }
      }

      // Try to extract external URL from HTML
      const externalUrlMatch = html.match(
        /"external_url"\s*:\s*"(https?:\/\/[^"]+)"/
      );
      if (externalUrlMatch) {
        website_url = externalUrlMatch[1];
      }

      return {
        handle: username,
        full_name: titleMatch
          ? titleMatch[1].split("(")[0].trim()
          : undefined,
        bio: descMatch ? descMatch[1].split(" - ").pop() : undefined,
        followers,
        following,
        posts_count,
        profile_pic_url: imageMatch ? imageMatch[1] : undefined,
        website_url,
      };
    }

    return null;
  } catch (err: any) {
    log("analyze:extract", "parse_error", { error: err.message });
    return null;
  }
}

// ============================================================
// Estimate profile from username patterns (copied from scrape route)
// ============================================================

function estimateProfileFromUsername(username: string): BasicData {
  const lower = username.toLowerCase();

  let estimated_niche = "general";
  if (
    lower.includes("shop") ||
    lower.includes("store") ||
    lower.includes("brand")
  )
    estimated_niche = "e-commerce";
  else if (
    lower.includes("food") ||
    lower.includes("cook") ||
    lower.includes("recipe") ||
    lower.includes("kitchen")
  )
    estimated_niche = "food";
  else if (
    lower.includes("fit") ||
    lower.includes("gym") ||
    lower.includes("workout") ||
    lower.includes("health")
  )
    estimated_niche = "fitness";
  else if (
    lower.includes("travel") ||
    lower.includes("adventure") ||
    lower.includes("explore")
  )
    estimated_niche = "travel";
  else if (
    lower.includes("tech") ||
    lower.includes("dev") ||
    lower.includes("code")
  )
    estimated_niche = "technology";
  else if (
    lower.includes("art") ||
    lower.includes("design") ||
    lower.includes("creative")
  )
    estimated_niche = "creative";
  else if (
    lower.includes("beauty") ||
    lower.includes("makeup") ||
    lower.includes("skin")
  )
    estimated_niche = "beauty";
  else if (
    lower.includes("book") ||
    lower.includes("read") ||
    lower.includes("write") ||
    lower.includes("knjig")
  )
    estimated_niche = "books/publishing";

  // Generate a display name from the username
  const displayName = username
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    handle: username,
    full_name: displayName,
    bio: `Estimated profile for @${username} (niche: ${estimated_niche})`,
  };
}

// ============================================================
// PHASE 1: Web URL Scrape (adapted from website scrape route)
// ============================================================

async function scrapeWebUrl(url: string): Promise<BasicData> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return extractBasicDataFromWebsite(html, url);
  } catch (err: any) {
    log("analyze:web", "scrape_failed", { url, error: err.message });
    return {
      website_url: url,
      title: null as any,
      description: null as any,
    };
  }
}

// ============================================================
// Extract basic data from website HTML (copied from website scrape route)
// ============================================================

function extractBasicDataFromWebsite(html: string, url: string): BasicData {
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Meta description
  const descMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
  );
  const description = descMatch ? descMatch[1].trim() : null;

  // OG image (often logo)
  const ogImageMatch = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
  );
  let logo_url = ogImageMatch ? ogImageMatch[1] : null;

  if (!logo_url) {
    const logoPatterns = [
      /<img[^>]*class=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
      /<img[^>]*src=["']([^"']+logo[^"']+)["']/i,
      /<link[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["']/i,
    ];
    for (const pattern of logoPatterns) {
      const match = html.match(pattern);
      if (match) {
        logo_url = match[1];
        break;
      }
    }
  }

  // Social links
  const social_links: Record<string, string> = {};
  const socialPatterns: Record<string, RegExp> = {
    instagram:
      /href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"']+)["']/i,
    facebook:
      /href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"']+)["']/i,
    twitter:
      /href=["'](https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"']+)["']/i,
    linkedin:
      /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/[^"']+)["']/i,
    tiktok:
      /href=["'](https?:\/\/(?:www\.)?tiktok\.com\/[^"']+)["']/i,
  };
  for (const [platform, pattern] of Object.entries(socialPatterns)) {
    const match = html.match(pattern);
    if (match) social_links[platform] = match[1];
  }

  // Extract Instagram handle from social link
  let handle: string | undefined;
  if (social_links.instagram) {
    const igMatch = social_links.instagram.match(
      /instagram\.com\/([a-zA-Z0-9._]+)/
    );
    if (igMatch) handle = igMatch[1];
  }

  // Contact
  const contact: { email?: string; phone?: string } = {};
  const emailMatch = html.match(
    /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
  );
  if (emailMatch) contact.email = emailMatch[1];

  const phoneMatch = html.match(/tel:([+\d\s()-]+)/i);
  if (phoneMatch) contact.phone = phoneMatch[1].trim();

  // Extract text content for GPT
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Extract brand name from title
  const full_name = title?.split(/[|\-–—]/)[0].trim() || null;

  return {
    handle,
    full_name: full_name || undefined,
    bio: description || undefined,
    website_url: url,
    title: title || undefined,
    description: description || undefined,
    logo_url: logo_url || undefined,
    social_links,
    contact,
    raw_text_sample: textContent.slice(0, 5000),
  };
}

// ============================================================
// Estimate from company name
// ============================================================

function estimateFromCompanyName(name: string): BasicData {
  // Generate a potential IG handle from name
  const potentialHandle = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, "")
    .replace(/\s+/g, "_")
    .slice(0, 30);

  return {
    full_name: name,
    handle: potentialHandle || undefined,
    bio: `Estimated profile for "${name}"`,
  };
}

// ============================================================
// PHASE 2: GPT Brand Analysis
// ============================================================

async function runGPTAnalysis(
  basic: BasicData,
  inputType: InputType,
  originalInput: string
): Promise<BrandAnalysis | null> {
  const systemPrompt = `You are a brand analyst. Analyze the provided data about a brand/company and return structured JSON.
Respond in the brand's detected language (auto-detect from the data provided).
If the brand appears to be from a non-English speaking country, write usp_analysis and recommended_focus in that language.

Return ONLY valid JSON with this exact structure:
{
  "company": "Company Name",
  "services": "Brief description of main services/products",
  "brand_tone": "2-3 word tone description (e.g. Informational, authoritative)",
  "target_audience": "Primary audience segments",
  "language": "Detected language (e.g. Croatian, English, German)",
  "usp_analysis": "2-3 paragraphs analyzing the brand's unique selling proposition, strengths, and market position. Write this in the brand's detected language.",
  "recommended_focus": "1-2 paragraphs recommending content focus for the next 30 days. Write this in the brand's detected language.",
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "opportunities": ["Opportunity 1", "Opportunity 2"]
}`;

  // Build context for GPT
  const parts: string[] = [];
  parts.push(`Input type: ${inputType}`);
  parts.push(`Original input: ${originalInput}`);

  if (basic.full_name) parts.push(`Name: ${basic.full_name}`);
  if (basic.handle) parts.push(`Instagram: @${basic.handle}`);
  if (basic.bio) parts.push(`Bio/Description: ${basic.bio}`);
  if (basic.followers) parts.push(`Followers: ${basic.followers}`);
  if (basic.posts_count) parts.push(`Posts: ${basic.posts_count}`);
  if (basic.website_url) parts.push(`Website: ${basic.website_url}`);
  if (basic.title) parts.push(`Website title: ${basic.title}`);
  if (basic.description) parts.push(`Website description: ${basic.description}`);
  if (basic.raw_text_sample) {
    parts.push(`Website content sample:\n${basic.raw_text_sample}`);
  }
  if (basic.social_links && Object.keys(basic.social_links).length > 0) {
    parts.push(`Social links: ${JSON.stringify(basic.social_links)}`);
  }

  const userMessage = parts.join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(10000), // 10s timeout for GPT
    });

    if (!response.ok) {
      const errorText = await response.text();
      log("analyze:gpt", "api_error", {
        status: response.status,
        error: errorText.substring(0, 200),
      });
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      log("analyze:gpt", "empty_response");
      return null;
    }

    // Parse JSON (handle markdown code blocks just in case)
    let jsonStr = content;
    if (content.includes("```")) {
      jsonStr = content
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    const analysis: BrandAnalysis = {
      company: parsed.company || basic.full_name || "Unknown",
      services: parsed.services || "Not determined",
      brand_tone: parsed.brand_tone || "Not determined",
      target_audience: parsed.target_audience || "General audience",
      language: parsed.language || "English",
      usp_analysis: parsed.usp_analysis || "",
      recommended_focus: parsed.recommended_focus || "",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      opportunities: Array.isArray(parsed.opportunities)
        ? parsed.opportunities
        : [],
    };

    log("analyze:gpt", "success", {
      company: analysis.company,
      language: analysis.language,
      tokens: data.usage?.total_tokens,
    });

    return analysis;
  } catch (err: any) {
    log("analyze:gpt", "error", { error: err.message });
    return null;
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { input } = body;

    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "input is required", input: input || "" },
        { status: 400 }
      );
    }

    const trimmedInput = input.trim();
    log("analyze", "start", { input: trimmedInput });

    // ========================================
    // DETECT INPUT TYPE
    // ========================================
    const { type: inputType, normalized } = detectInputType(trimmedInput);
    log("analyze", "detected_type", { inputType, normalized });

    // ========================================
    // PHASE 1: Quick data extraction
    // ========================================
    let basic: BasicData = {};

    switch (inputType) {
      case "instagram_handle":
      case "instagram_url": {
        const handle = normalized;
        log("analyze:phase1", "scraping_instagram", { handle });

        // Try direct scrape first
        const scraped = await tryDirectScrape(handle);

        if (scraped) {
          basic = { ...scraped, handle };
          log("analyze:phase1", "ig_scraped", {
            handle,
            has_name: !!basic.full_name,
            has_followers: !!basic.followers,
          });
        } else {
          // Fallback: estimate from username
          basic = estimateProfileFromUsername(handle);
          log("analyze:phase1", "ig_estimated", { handle });
        }

        // If we found a website URL from IG, try to scrape it too
        if (basic.website_url) {
          try {
            const webData = await scrapeWebUrl(basic.website_url);
            // Merge web data without overwriting IG data
            if (webData.description && !basic.bio) basic.bio = webData.description;
            if (webData.logo_url && !basic.profile_pic_url)
              basic.profile_pic_url = webData.logo_url;
            if (webData.raw_text_sample)
              basic.raw_text_sample = webData.raw_text_sample;
            if (webData.social_links)
              basic.social_links = { ...basic.social_links, ...webData.social_links };
            if (webData.contact) basic.contact = webData.contact;
          } catch {
            // Non-critical, ignore
          }
        }

        break;
      }

      case "web_url": {
        log("analyze:phase1", "scraping_website", { url: normalized });
        basic = await scrapeWebUrl(normalized);
        basic.website_url = normalized;

        // If we found an Instagram handle from the website, try to scrape that too
        if (basic.handle) {
          try {
            const igData = await tryDirectScrape(basic.handle);
            if (igData) {
              if (igData.followers) basic.followers = igData.followers;
              if (igData.following) basic.following = igData.following;
              if (igData.posts_count) basic.posts_count = igData.posts_count;
              if (igData.profile_pic_url)
                basic.profile_pic_url = igData.profile_pic_url;
              if (igData.bio && !basic.bio) basic.bio = igData.bio;
            }
          } catch {
            // Non-critical, ignore
          }
        }

        log("analyze:phase1", "web_scraped", {
          url: normalized,
          has_name: !!basic.full_name,
          has_handle: !!basic.handle,
        });
        break;
      }

      case "company_name": {
        log("analyze:phase1", "estimating_from_name", { name: normalized });
        basic = estimateFromCompanyName(normalized);
        break;
      }
    }

    const phase1Duration = Date.now() - startTime;
    log("analyze", "phase1_complete", { duration_ms: phase1Duration });

    // ========================================
    // PHASE 2: GPT Analysis
    // ========================================
    const analysis = await runGPTAnalysis(basic, inputType, trimmedInput);

    const totalDuration = Date.now() - startTime;
    log("analyze", "complete", {
      inputType,
      has_analysis: !!analysis,
      duration_ms: totalDuration,
    });

    // ========================================
    // RESPONSE
    // ========================================

    // If GPT returned a company name, update basic.full_name
    if (analysis?.company && !basic.full_name) {
      basic.full_name = analysis.company;
    }

    const response: AnalyzeResponse = {
      success: true,
      input: trimmedInput,
      input_type: inputType,
      basic: {
        handle: basic.handle,
        full_name: basic.full_name,
        bio: basic.bio,
        followers: basic.followers,
        posts_count: basic.posts_count,
        profile_pic_url: basic.profile_pic_url || basic.logo_url,
        website_url: basic.website_url,
      },
      analysis,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log("analyze", "fatal_error", { error: error.message, duration_ms: duration });

    let input = "";
    try {
      const body = await req.json().catch(() => ({}));
      input = (body as any)?.input || "";
    } catch {
      // ignore
    }

    const errorResponse: AnalyzeErrorResponse = {
      success: false,
      error: "Could not analyze profile",
      input,
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
