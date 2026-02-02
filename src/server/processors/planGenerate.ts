// ============================================================
// PLAN GENERATE PROCESSOR (WITH NOTIFICATIONS)
// ============================================================
// Generates content plan using ChatGPT.
// FIXED: Added notification when plan completes
// ============================================================

import { q } from "@/lib/db";
import { qRender } from "@/lib/jobs";
import { llmJSON } from "@/lib/llm";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { notify } from "@/lib/notifications";

// ============================================================
// TYPES
// ============================================================

export interface PlanGenerateInput {
  project_id: string;
  month: string;
  limit?: number | null;
}

export interface PlanGenerateResult {
  content_pack_id: string;
  items: number;
}

// ============================================================
// MAIN PROCESSOR
// ============================================================

export async function planGenerate(
  data: PlanGenerateInput
): Promise<PlanGenerateResult> {
  const { project_id, month, limit } = data;

  log("planGenerate", "start", { project_id, month, limit });

  // =========================================================
  // 1. Get brand profile
  // =========================================================
  const profileRow = await q<any>(
    `SELECT profile FROM brand_profiles WHERE project_id = $1`,
    [project_id]
  );
  const profile = profileRow[0]?.profile || {};

  // =========================================================
  // 2. Get policy arms (RL)
  // =========================================================
  const arms = await q<any>(
    `SELECT arm_id, arm_params FROM bandit_arms ORDER BY RANDOM()`
  );

  if (arms.length === 0) {
    throw new Error("No bandit arms found. Run seed migration.");
  }

  // =========================================================
  // 3. Create content pack
  // =========================================================
  const packId = "pack_" + uuid();
  await q(
    `INSERT INTO content_packs (id, project_id, month, status, created_at)
     VALUES ($1, $2, $3, 'generating', NOW())`,
    [packId, project_id, month]
  );

  log("planGenerate", "content_pack created", { packId });

  // =========================================================
  // 4. Determine how many items to generate
  // =========================================================
  const DEV_LIMIT = parseInt(process.env.DEV_GENERATE_LIMIT || "3", 10);
  const itemCount = limit ?? DEV_LIMIT;

  // =========================================================
  // 5. Generate items
  // =========================================================
  const itemIds: string[] = [];

  for (let i = 0; i < itemCount; i++) {
    const arm = arms[i % arms.length];

    log("planGenerate:item", "generate item", {
      index: i + 1,
      total: itemCount,
      format: arm.arm_params?.format
    });

    // Call LLM for content generation
    log("planGenerate:llm", "calling llmJSON", { slot: i + 1 });

    let out: any;
    try {
      out = await llmJSON({
        system: `You are a social media content strategist for Instagram.
Brand profile: ${JSON.stringify(profile)}
Generate content for slot ${i + 1} in format: ${arm.arm_params?.format || "feed"}`,
        user: `Generate Instagram post for ${month}. Include:
- topic: brief topic/theme
- caption: { short, long, hashtags[] }
- visual_direction: { scene_description, on_screen_text, negative_prompt[] }

Respond in JSON only.`,
        schema: {
          type: "object",
          properties: {
            topic: { type: "string" },
            caption: {
              type: "object",
              properties: {
                short: { type: "string" },
                long: { type: "string" },
                hashtags: { type: "array", items: { type: "string" } }
              }
            },
            visual_direction: {
              type: "object",
              properties: {
                scene_description: { type: "string" },
                on_screen_text: { type: "string" },
                negative_prompt: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      });
    } catch (llmError: any) {
      log("planGenerate:llm", "llm_error", { error: llmError.message });
      
      // Fallback content
      out = {
        topic: `Objava ${i + 1}`,
        caption: {
          short: `Objava ${i + 1}`,
          long: `Detaljan opis za objavu ${i + 1}`,
          hashtags: ["#content", "#instagram"]
        },
        visual_direction: {
          scene_description: `Product in focus, clean background.`,
          negative_prompt: ["watermark", "distorted text", "low-res"],
          on_screen_text: ""
        }
      };
    }

    // Insert content item
    const itemId = "item_" + uuid();
    await q(
      `INSERT INTO content_items(id, content_pack_id, project_id, day, format, topic, visual_brief, caption)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        itemId,
        packId,
        project_id,
        1 + i,
        arm.arm_params?.format || "feed",
        out.topic ?? `Tema ${i + 1}`,
        JSON.stringify({
          scene_description: out.visual_direction?.scene_description ?? arm.arm_params?.scene_template,
          on_screen_text: out.visual_direction?.on_screen_text ?? null,
          negative_prompt: out.visual_direction?.negative_prompt ?? []
        }),
        JSON.stringify(out.caption ?? {})
      ]
    );

    // Save features for RL
    await q(
      `INSERT INTO content_features(content_item_id, project_id, arm_id, features)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (content_item_id) DO UPDATE SET arm_id=EXCLUDED.arm_id, features=EXCLUDED.features`,
      [itemId, project_id, arm.arm_id, JSON.stringify(arm.arm_params)]
    );

    itemIds.push(itemId);

    // Queue render
    const prompt = `Photorealistic instagram-ready image. ${out.visual_direction?.scene_description ?? arm.arm_params?.scene_template}. On-screen text: "${out.visual_direction?.on_screen_text ?? ""}".`;
    const negative = (out.visual_direction?.negative_prompt ?? []).join(", ");

    log("queue:render", "enqueue render.flux", { content_item_id: itemId });

    await qRender.add("render.flux", {
      content_item_id: itemId,
      prompt,
      negative_prompt: negative
    });
  }

  // =========================================================
  // 6. Update pack status
  // =========================================================
  await q(
    `UPDATE content_packs SET status = 'generated' WHERE id = $1`,
    [packId]
  );

  // =========================================================
  // 7. ✅ SEND NOTIFICATION
  // =========================================================
  try {
    await notify.planGenerated(project_id, itemIds.length, month);
    log("planGenerate", "notification_sent", { project_id, items: itemIds.length });
  } catch (notifyError: any) {
    log("planGenerate", "notification_failed", { error: notifyError.message });
  }

  log("planGenerate", "done", { packId, items: itemIds.length });

  return { content_pack_id: packId, items: itemIds.length };
}
