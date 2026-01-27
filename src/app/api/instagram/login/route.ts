import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export async function GET() {
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
      state: "vissocial"
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
