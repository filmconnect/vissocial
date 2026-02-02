import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";
import { v4 as uuid } from "uuid";
import OpenAI from "openai";
import { config } from "@/lib/config";

const PROJECT_ID = "proj_local";

const openai = new OpenAI({ apiKey: config.openaiKey });

// ============================================================
// TYPES
// ============================================================

interface ScrapedData {
  url: string;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  brand_name: string | null;
  about: string | null;
  products: Array<{
    name: string;
    category: string;
    description?: string;
    image_url?: string;
  }>;
  contact: {
    email?: string;
    phone?: string;
    address?: string;
  };
  social_links: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    tiktok?: string;
  };
  colors: string[];
  raw_text_sample: string;
}

// ============================================================
// FETCH PAGE HTML
// ============================================================

async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// EXTRACT BASIC DATA FROM HTML
// ============================================================

function extractBasicData(html: string, url: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {
    url,
    products: [],
    contact: {},
    social_links: {},
    colors: [],
  };

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  data.title = titleMatch ? titleMatch[1].trim() : null;

  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  data.description = descMatch ? descMatch[1].trim() : null;

  // OG image (often logo)
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    data.logo_url = ogImageMatch[1];
  }

  // Logo from common patterns
  if (!data.logo_url) {
    const logoPatterns = [
      /<img[^>]*class=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
      /<img[^>]*src=["']([^"']+logo[^"']+)["']/i,
      /<link[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["']/i,
    ];
    for (const pattern of logoPatterns) {
      const match = html.match(pattern);
      if (match) {
        data.logo_url = match[1];
        break;
      }
    }
  }

  // Social links
  const socialPatterns: Record<string, RegExp> = {
    instagram: /href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"']+)["']/i,
    facebook: /href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"']+)["']/i,
    twitter: /href=["'](https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"']+)["']/i,
    linkedin: /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/[^"']+)["']/i,
    tiktok: /href=["'](https?:\/\/(?:www\.)?tiktok\.com\/[^"']+)["']/i,
  };

  for (const [platform, pattern] of Object.entries(socialPatterns)) {
    const match = html.match(pattern);
    if (match) {
      (data.social_links as any)[platform] = match[1];
    }
  }

  // Email
  const emailMatch = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) {
    data.contact!.email = emailMatch[1];
  }

  // Phone
  const phoneMatch = html.match(/tel:([+\d\s()-]+)/i);
  if (phoneMatch) {
    data.contact!.phone = phoneMatch[1].trim();
  }

  // Extract text content (remove scripts, styles, tags)
  let textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Limit to first 5000 chars for GPT
  data.raw_text_sample = textContent.slice(0, 5000);

  return data;
}

// ============================================================
// GPT EXTRACTION
// ============================================================

async function extractWithGPT(basicData: Partial<ScrapedData>): Promise<ScrapedData> {
  const prompt = `Analiziraj ovaj tekst s web stranice i izvuci strukturirane podatke.

URL: ${basicData.url}
Naslov: ${basicData.title || "N/A"}
Opis: ${basicData.description || "N/A"}

Tekst stranice (uzorak):
${basicData.raw_text_sample}

Izvuci i vrati JSON sa sljedećim poljima:
{
  "brand_name": "ime brenda/firme",
  "about": "kratak opis firme (max 200 znakova)",
  "products": [
    {"name": "ime proizvoda", "category": "kategorija", "description": "kratak opis"}
  ],
  "industry": "industrija (npr. books, fashion, food, tech, fitness, services)",
  "contact": {
    "email": "email ako postoji",
    "phone": "telefon ako postoji", 
    "address": "adresa ako postoji"
  },
  "colors": ["#hex1", "#hex2"] // dominantne boje ako možeš prepoznati iz teksta
}

Vrati SAMO JSON, bez dodatnog teksta.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ti si expert za ekstrakciju podataka s web stranica. Vraćaš samo validan JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    // Parse JSON (handle markdown code blocks)
    let jsonStr = content;
    if (content.includes("```")) {
      jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    }

    const extracted = JSON.parse(jsonStr);

    return {
      url: basicData.url!,
      title: basicData.title || null,
      description: basicData.description || null,
      logo_url: basicData.logo_url || null,
      brand_name: extracted.brand_name || basicData.title?.split(/[|\-–]/)[0].trim() || null,
      about: extracted.about || basicData.description || null,
      products: extracted.products || [],
      contact: {
        ...basicData.contact,
        ...extracted.contact,
      },
      social_links: basicData.social_links || {},
      colors: extracted.colors || [],
      raw_text_sample: basicData.raw_text_sample || "",
    };
  } catch (error: any) {
    log("scrape:gpt", "GPT extraction failed", { error: error.message });
    
    // Return basic data without GPT enhancement
    return {
      url: basicData.url!,
      title: basicData.title || null,
      description: basicData.description || null,
      logo_url: basicData.logo_url || null,
      brand_name: basicData.title?.split(/[|\-–]/)[0].trim() || null,
      about: basicData.description || null,
      products: [],
      contact: basicData.contact || {},
      social_links: basicData.social_links || {},
      colors: [],
      raw_text_sample: basicData.raw_text_sample || "",
    };
  }
}

// ============================================================
// SAVE TO DATABASE
// ============================================================

async function saveScrapedData(data: ScrapedData): Promise<void> {
  // Update brand profile with scraped data
  const [existingProfile] = await q<any>(
    `SELECT profile FROM brand_profiles WHERE project_id = $1`,
    [PROJECT_ID]
  );

  const currentProfile = existingProfile?.profile || {};
  
  const updatedProfile = {
    ...currentProfile,
    brand_name: data.brand_name || currentProfile.brand_name,
    about: data.about || currentProfile.about,
    website_url: data.url,
    logo_url: data.logo_url || currentProfile.logo_url,
    social_links: {
      ...currentProfile.social_links,
      ...data.social_links,
    },
    contact: {
      ...currentProfile.contact,
      ...data.contact,
    },
    colors_from_web: data.colors,
    _web_scraped_at: new Date().toISOString(),
  };

  await q(
    `UPDATE brand_profiles SET profile = $1, updated_at = NOW() WHERE project_id = $2`,
    [JSON.stringify(updatedProfile), PROJECT_ID]
  );

  // Save discovered products
  for (const product of data.products) {
    const productId = "prod_web_" + uuid().slice(0, 8);
    
    await q(
      `INSERT INTO detected_products (id, project_id, product_name, category, confidence, source, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'web_scrape', 'pending', $6)
       ON CONFLICT DO NOTHING`,
      [
        productId,
        PROJECT_ID,
        product.name,
        product.category || "other",
        0.7, // Lower confidence for web-scraped products
        JSON.stringify({ description: product.description, image_url: product.image_url }),
      ]
    );
  }

  // Update project name if we got brand name
  if (data.brand_name) {
    await q(
      `UPDATE projects SET name = $1, updated_at = NOW() WHERE id = $2 AND (name IS NULL OR name = 'Local Project')`,
      [data.brand_name, PROJECT_ID]
    );
  }

  log("scrape:save", "saved scraped data", {
    brand_name: data.brand_name,
    products_count: data.products.length,
    has_logo: !!data.logo_url,
  });
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    log("scrape:start", "scraping website", { url: normalizedUrl });

    // Fetch HTML
    const html = await fetchPageHtml(normalizedUrl);
    log("scrape:fetch", "fetched HTML", { length: html.length });

    // Extract basic data
    const basicData = extractBasicData(html, normalizedUrl);
    log("scrape:basic", "extracted basic data", { 
      title: basicData.title,
      has_logo: !!basicData.logo_url,
    });

    // Enhance with GPT
    const scrapedData = await extractWithGPT(basicData);
    log("scrape:gpt", "GPT extraction complete", {
      brand_name: scrapedData.brand_name,
      products: scrapedData.products.length,
    });

    // Save to database
    await saveScrapedData(scrapedData);

    return NextResponse.json({
      success: true,
      data: {
        brand_name: scrapedData.brand_name,
        about: scrapedData.about,
        logo_url: scrapedData.logo_url,
        products_found: scrapedData.products.length,
        social_links: scrapedData.social_links,
        contact: scrapedData.contact,
      },
    });
  } catch (error: any) {
    log("scrape:error", "scraping failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
