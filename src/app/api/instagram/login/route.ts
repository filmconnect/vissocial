// ============================================================
// API: /api/instagram/login
// ============================================================
// Starts Instagram OAuth flow.
// V9: Passes project_id in state param so callback knows which project.
// Cookie should also survive the redirect, but state is a safety net.
// ============================================================

import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getProjectId } from "@/lib/projectId";

export async function GET() {
  // Get (or create) project ID before redirecting to Instagram
  const projectId = await getProjectId();

  // Encode project_id in the OAuth state parameter
  // Format: "vissocial:<project_id>"
  const stateParam = `vissocial:${projectId}`;

  const redirectAfterLogin =
    "https://www.instagram.com/oauth/authorize/third_party/?" +
    new URLSearchParams({
      client_id: config.meta.appId,
      redirect_uri: config.meta.redirectUri,
      response_type: "code",
      scope: [
        "business_basic",
        "business_content_publish",
        "business_manage_comments",
        "instagram_business_manage_insights"
      ].join(","),
      state: stateParam
    }).toString();

  const loginUrl =
    "https://www.instagram.com/accounts/login/?" +
    new URLSearchParams({
      force_authentication: "1",
      platform_app_id: config.meta.appId,
      enable_fb_login: "1",
      next: redirectAfterLogin
    }).toString();

  return NextResponse.redirect(loginUrl);
}
