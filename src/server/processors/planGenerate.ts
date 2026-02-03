// ============================================================
// PLAN GENERATE - Content Plan Generator
// ============================================================
// Generates monthly content plans using RL-guided arm selection.
// FIXED: Correct column names for bandit_arms table (id, params)
// ============================================================

import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { chooseArm } from "@/lib/policyClient";
import { llmJSON } from "@/lib/llm";
import { qRender } from "@/lib/jobs";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

const SYSTEM = `You are Vissocial, a senior Instagram strategist and visual director.
Return JSON only. Write Croatian. Create a post concept + caption + visual blueprint.
Keep on-screen text <= 6 words.`;

// ============================================================
// Type definitions
// ============================================================

interface ArmParams {
  format: "reel" | "carousel" | "feed" | "story";
  pillar: string;
  hook_type: string;
  caption_length: string;
  cta_type: string;
  scene_template: string;
  promo_level: number;
}

interface ChosenArm {
  arm_id: string;
  arm_params: ArmParams;
  policy_state: Record<string, any>;
}

interface PlanGenerateInput {
  project_id: string;
  month: string;
  limit?: number | null;
}

// ============================================================
// Fallback arm selection when Policy service is unavailable
// ============================================================

async function getLocalFallbackArm(index: number): Promise<ChosenArm> {
  try {
    // FIXED: Use correct column names (id, params) not (arm_id, arm_params)
    const arms = await q<{ id: string; params: any }>(
      `SELECT id, params FROM bandit_arms ORDER BY RANDOM() LIMIT 1`
    );

    if (arms.length > 0) {
      const arm = arms[0];
      // Parse params if it's a string
      const armParams = typeof arm.params === "string" 
        ? JSON.parse(arm.params) 
        : arm.params;

      log("planGenerate:fallback", "using DB arm", { arm_id: arm.id });
      
      return {
        arm_id: arm.id,
        arm_params: armParams,
        policy_state: {}
      };
    }
  } catch (dbError: any) {
    log("planGenerate:fallback", "DB fallback failed", { 
      error: dbError.message 
    });
  }

  // Ultimate fallback - hardcoded defaults
  const formats: Array<"reel" | "carousel" | "feed"> = ["reel", "carousel", "feed"];
  const format = formats[index % 3];

  log("planGenerate:fallback", "using hardcoded defaults", { format });

  return {
    arm_id: "fallback",
    arm_params: {
      format,
      pillar: "mixed",
      hook_type: "question",
      caption_length: "medium",
      cta_type: "comment",
      scene_template: "studio_clean",
      promo_level: 0.3
    },
    policy_state: {}
  };
}

// ============================================================
// Main plan generation function
// ============================================================

export async function planGenerate(data: PlanGenerateInput) {
  log("planGenerate", "start", data);
  
  const { project_id, month } = data;
  const N = (data.limit ?? config.dev.generateLimit ?? 30) as number;

  // Create content pack
  const packId = "pack_" + uuid();
  await q(
    `INSERT INTO content_packs(id, project_id, month) VALUES ($1,$2,$3)`,
    [packId, project_id, month]
  );
  log("planGenerate", "content_pack created", { packId });

  // Get brand profile
  const brand = (
    await q<any>(
      `SELECT profile FROM brand_profiles WHERE project_id=$1`,
      [project_id]
    )
  )[0]?.profile ?? {};

  const itemIds: string[] = [];

  // Generate N content items
  for (let i = 0; i < N; i++) {
    let arm: ChosenArm;

    // Try policy service first, fallback to local selection
    try {
      arm = await chooseArm(project_id, month, { slot_index: i, month });
    } catch (policyError: any) {
      log("planGenerate:policy", "policy service unavailable, using fallback", {
        error: policyError.message
      });
      arm = await getLocalFallbackArm(i);
    }

    // Prepare LLM prompt
    const user = {
      brand_profile: brand,
      slot: { day: 1 + i, month },
      arm: arm.arm_params,
      instruction: "Generate one Instagram post with caption and visual_direction (scene_description, negative_prompt[], on_screen_text)."
    };

    log("planGenerate:item", "generate item", {
      index: i + 1,
      total: N,
      arm_id: arm.arm_id,
      format: arm.arm_params?.format
    });

    // Generate content using LLM
    let out: any;
    try {
      log("planGenerate:llm", "calling llmJSON", { slot: i + 1 });
      out = await llmJSON<any>(SYSTEM, JSON.stringify(user));
    } catch (llmError: any) {
      log("planGenerate:llm", "llm fallback used", { 
        slot: i + 1,
        error: llmError.message
      });
      out = {
        topic: `Tema ${i + 1}`,
        caption: {
          long: `Dulji caption ${i + 1} (MVP fallback).`,
          short: `Hook ${i + 1}`,
          cta: "Javi u komentaru."
        },
        visual_direction: {
          scene_description: `Scene template: ${arm.arm_params.scene_template}. Product in focus, clean background.`,
          negative_prompt: ["watermark", "distorted text", "misspelled logo", "low-res"],
          on_screen_text: `Objava ${i + 1}`
        }
      };
    }

    // Create content item
    const itemId = "item_" + uuid();
    await q(
      `INSERT INTO content_items(id, content_pack_id, project_id, day, format, topic, visual_brief, caption)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        itemId,
        packId,
        project_id,
        1 + i,
        arm.arm_params.format,
        out.topic ?? `Tema ${i + 1}`,
        JSON.stringify({
          scene_description: out.visual_direction?.scene_description ?? arm.arm_params.scene_template,
          on_screen_text: out.visual_direction?.on_screen_text ?? null,
          negative_prompt: out.visual_direction?.negative_prompt ?? []
        }),
        JSON.stringify(out.caption ?? {})
      ]
    );

    // Store arm features for RL feedback loop
    // Note: arm_id column in content_features references bandit_arms.id
    await q(
      `INSERT INTO content_features(content_item_id, project_id, arm_id, features)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (content_item_id) DO UPDATE SET arm_id=EXCLUDED.arm_id, features=EXCLUDED.features`,
      [itemId, project_id, arm.arm_id, JSON.stringify(arm.arm_params)]
    );

    itemIds.push(itemId);

    // Queue render job
    const prompt = `Photorealistic instagram-ready image. ${out.visual_direction?.scene_description ?? arm.arm_params.scene_template}. On-screen text: "${out.visual_direction?.on_screen_text ?? ""}".`;
    const negative = (out.visual_direction?.negative_prompt ?? []).join(", ");

    log("queue:render", "enqueue render.flux", { content_item_id: itemId });

    await qRender.add("render.flux", {
      content_item_id: itemId,
      prompt,
      negative_prompt: negative
    });
  }

  log("planGenerate", "done", {
    packId,
    items: itemIds.length
  });

  return {
    content_pack_id: packId,
    items: itemIds.length
  };
}
