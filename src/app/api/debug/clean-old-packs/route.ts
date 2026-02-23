// ============================================================
// POST /api/debug/clean-old-packs
// ============================================================
// Briše stare content packove i sve povezane renderove i iteme.
// Čuva samo najnoviji pack.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Find the latest pack
    const latestPack = await q<any>(
      `SELECT id FROM content_packs ORDER BY created_at DESC LIMIT 1`
    );

    if (latestPack.length === 0) {
      return NextResponse.json({ action: "clean-old-packs", deleted: 0, message: "No packs found" });
    }

    const keepId = latestPack[0].id;

    // Count old packs
    const oldPacks = await q<any>(
      `SELECT id FROM content_packs WHERE id != $1`,
      [keepId]
    );

    // Delete renders for old items
    const deletedRenders = await q<any>(
      `DELETE FROM renders
       WHERE content_item_id IN (
         SELECT id FROM content_items
         WHERE content_pack_id != $1
       )
       RETURNING id`,
      [keepId]
    );

    // Delete content_features for old items
    await q(
      `DELETE FROM content_features
       WHERE content_item_id IN (
         SELECT id FROM content_items
         WHERE content_pack_id != $1
       )`,
      [keepId]
    );

    // Delete old content items
    const deletedItems = await q<any>(
      `DELETE FROM content_items WHERE content_pack_id != $1 RETURNING id`,
      [keepId]
    );

    // Delete old packs
    const deletedPacks = await q<any>(
      `DELETE FROM content_packs WHERE id != $1 RETURNING id`,
      [keepId]
    );

    return NextResponse.json({
      ts: new Date().toISOString(),
      action: "clean-old-packs",
      kept: keepId,
      deleted: {
        packs: deletedPacks.length,
        items: deletedItems.length,
        renders: deletedRenders.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
