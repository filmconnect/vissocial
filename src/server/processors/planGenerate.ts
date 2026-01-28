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

export async function planGenerate(data: { project_id: string; month: string; limit?: number | null }) {
	log("planGenerate", "start", data);
  const { project_id, month } = data;
  const N = (data.limit ?? config.dev.generateLimit ?? 30) as number;

  const packId = "pack_" + uuid();
  await q(`INSERT INTO content_packs(id, project_id, month) VALUES ($1,$2,$3)`, [packId, project_id, month]);
  log("planGenerate", "content_pack created", { packId });


  const brand = (await q<any>(`SELECT profile FROM brand_profiles WHERE project_id=$1`, [project_id]))[0]?.profile ?? {};
  const itemIds: string[] = [];

  for (let i = 0; i < N; i++) {

    let arm: any;
    try {
      arm = await chooseArm(project_id, month, { slot_index: i, month });
    } catch {
      arm = { arm_id: "fallback", arm_params: { format: (i % 3 === 0 ? "reel" : i % 3 === 1 ? "carousel" : "feed"), pillar: "mixed", hook_type: "question", caption_length: "medium", cta_type: "comment", scene_template: "studio_clean", promo_level: 0.3 }, policy_state: {} };
    }

    const user = {
      brand_profile: brand,
      slot: { day: 1 + i, month },
      arm: arm.arm_params,
      instruction: "Generate one Instagram post with caption and visual_direction (scene_description, negative_prompt[], on_screen_text)."
    };
	log("planGenerate:item", "generate item", {
	  index: i + 1,
	  total: N,
	  format: arm?.arm_params?.format
	});
    let out: any;
    try {
		log("planGenerate:llm", "calling llmJSON", {
		  slot: i + 1
		});

      out = await llmJSON<any>(SYSTEM, JSON.stringify(user));
    } catch {
		log("planGenerate:llm", "llm fallback used", {
		  slot: i + 1
		});
      out = {
        topic: `Tema ${i + 1}`,
        caption: { long: `Dulji caption ${i + 1} (MVP fallback).`, short: `Hook ${i + 1}`, cta: "Javi u komentaru." },
        visual_direction: {
          scene_description: `Scene template: ${arm.arm_params.scene_template}. Product in focus, clean background.`,
          negative_prompt: ["watermark", "distorted text", "misspelled logo", "low-res"],
          on_screen_text: `Objava ${i + 1}`
        }
      };
    }

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

    await q(
      `INSERT INTO content_features(content_item_id, project_id, arm_id, features)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (content_item_id) DO UPDATE SET arm_id=EXCLUDED.arm_id, features=EXCLUDED.features`,
      [itemId, project_id, arm.arm_id, JSON.stringify(arm.arm_params)]
    );

    itemIds.push(itemId);

    const prompt = `Photorealistic instagram-ready image. ${out.visual_direction?.scene_description ?? arm.arm_params.scene_template}. On-screen text: "${out.visual_direction?.on_screen_text ?? ""}".`;
    const negative = (out.visual_direction?.negative_prompt ?? []).join(", ");
	log("queue:render", "enqueue render.flux", {
	  content_item_id: itemId
	});

    await qRender.add("render.flux", { content_item_id: itemId, prompt, negative_prompt: negative });
  }
	log("planGenerate", "done", {
	  packId,
	  items: itemIds.length
	});

  return { content_pack_id: packId, items: itemIds.length };
}
