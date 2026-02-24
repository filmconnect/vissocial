// ============================================================
// API: /api/instagram/callback
// ============================================================
// OAuth callback - nakon autentifikacije redirect na /chat
// TAKOĐER: Ažurira postojeću chat sesiju da nastavi onboarding
// V9: Dynamic project_id from state param (+ cookie fallback)
// V9: Detects IG account change → cleans old data before ingest
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { exchangeCodeForToken, getLongLivedToken, getInstagramUser } from "@/lib/instagram";
import { qIngest } from "@/lib/jobs";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { v4 as uuid } from "uuid";
import { readProjectId } from "@/lib/projectId";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";

  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }

  // =========================================================
  // 1. Determine project_id from state param or cookie
  // =========================================================
  let projectId: string | null = null;

  // Try state param first (format: "vissocial:<project_id>")
  if (state.startsWith("vissocial:")) {
    projectId = state.replace("vissocial:", "");
  }

  // Fallback to cookie
  if (!projectId) {
    projectId = readProjectId();
  }

  if (!projectId) {
    log("instagram:callback", "no project_id found in state or cookie");
    return NextResponse.redirect(
      `${config.appUrl.replace(/\/$/, "")}/chat?ig=error`
    );
  }

  // Verify project exists
  const projectRows = await q<any>(`SELECT id, ig_user_id FROM projects WHERE id=$1`, [projectId]);
  if (!projectRows[0]) {
    log("instagram:callback", "project not found", { projectId });
    return NextResponse.redirect(
      `${config.appUrl.replace(/\/$/, "")}/chat?ig=error`
    );
  }

  const oldIgUserId = projectRows[0].ig_user_id;

  try {
    log("instagram:callback", "starting OAuth exchange", { projectId });

    // =========================================================
    // 2. Exchange code for tokens
    // =========================================================
    const shortTok = await exchangeCodeForToken(code);
    const longTok = await getLongLivedToken(shortTok.access_token);
    const igUser = await getInstagramUser(longTok.access_token);

    log("instagram:callback", "OAuth tokens obtained", {
      ig_user_id: igUser.id,
      old_ig_user_id: oldIgUserId,
      same_account: oldIgUserId === igUser.id
    });

    // =========================================================
    // 3. Check if IG account changed → clean old data
    // =========================================================
    if (oldIgUserId && oldIgUserId !== igUser.id) {
      log("instagram:callback", "IG account CHANGED — cleaning old data", {
        old: oldIgUserId,
        new: igUser.id,
        projectId
      });

      // Delete old IG-sourced data (keep manually uploaded references!)
      await q(
        `DELETE FROM detected_products WHERE project_id = $1`,
        [projectId]
      );

      await q(
        `DELETE FROM instagram_analyses WHERE asset_id IN (
          SELECT id FROM assets WHERE project_id = $1 AND source = 'instagram'
        )`,
        [projectId]
      );

      await q(
        `DELETE FROM assets WHERE project_id = $1 AND source = 'instagram'`,
        [projectId]
      );

      // Reset brand profile (will be rebuilt from new IG data)
      await q(
        `UPDATE brand_profiles SET profile = '{}'::jsonb WHERE project_id = $1`,
        [projectId]
      );

      // Delete old content packs + items + renders (they were based on old brand)
      await q(
        `DELETE FROM renders WHERE content_item_id IN (
          SELECT id FROM content_items WHERE project_id = $1
        )`,
        [projectId]
      );
      await q(`DELETE FROM content_features WHERE project_id = $1`, [projectId]);
      await q(`DELETE FROM content_items WHERE project_id = $1`, [projectId]);
      await q(`DELETE FROM content_packs WHERE project_id = $1`, [projectId]);

      log("instagram:callback", "old IG data cleaned", { projectId });
    } else if (oldIgUserId === igUser.id) {
      log("instagram:callback", "same IG account — refreshing token only", {
        ig_user_id: igUser.id
      });
    }

    // =========================================================
    // 4. Save new tokens + IG user ID
    // =========================================================
    const expiresAt = new Date(Date.now() + longTok.expires_in * 1000);
    await q(
      `UPDATE projects 
       SET ig_connected = true, 
           meta_access_token = $1, 
           meta_token_expires_at = $2, 
           ig_user_id = $3,
           updated_at = now() 
       WHERE id = $4`,
      [longTok.access_token, expiresAt.toISOString(), igUser.id, projectId]
    );

    log("instagram:callback", "OAuth complete, queueing ingest", {
      ig_user_id: igUser.id,
      projectId
    });

    // =========================================================
    // 5. Queue ingest
    // =========================================================
    await qIngest.add("instagram.ingest", { project_id: projectId });

    // =========================================================
    // 6. Update existing chat session to continue onboarding
    // =========================================================
    const sessions = await q<any>(
      `SELECT id, state FROM chat_sessions 
       WHERE project_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [projectId]
    );

    if (sessions.length > 0) {
      const session = sessions[0];
      const currentState = session.state || {};
      
      // Update state to onboarding step
      await q(
        `UPDATE chat_sessions SET state = $1 WHERE id = $2`,
        [JSON.stringify({ 
          ...currentState, 
          step: "onboarding",
          ig_just_connected: true  // Flag to show welcome message
        }), session.id]
      );

      log("instagram:callback", "session state updated", {
        session_id: session.id,
        new_step: "onboarding"
      });
    }

    // =========================================================
    // 7. Redirect to /chat
    // =========================================================
    const redirectUrl = `${config.appUrl.replace(/\/$/, "")}/chat?ig=connected`;
    
    log("instagram:callback", "redirecting to chat", { redirectUrl });

    return NextResponse.redirect(redirectUrl);

  } catch (error: any) {
    log("instagram:callback", "error", { error: error.message, projectId });
    return NextResponse.redirect(
      `${config.appUrl.replace(/\/$/, "")}/chat?ig=error`
    );
  }
}
