import { q } from "@/lib/db";
import { qPublish } from "@/lib/jobs";

export async function scheduleTick() {
  const due = await q<any>(`
    SELECT id FROM content_items
    WHERE publish_mode IN ('in_app_schedule','auto_publish')
      AND publish_status='scheduled'
      AND scheduled_at <= now()
    LIMIT 20`);
  for (const it of due) {
    await qPublish.add("publish.instagram", { content_item_id: it.id });
  }
  return { ok: true, due: due.length };
}
