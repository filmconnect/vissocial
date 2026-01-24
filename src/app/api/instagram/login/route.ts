import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export async function GET() {
  const u = new URL("https://www.facebook.com/dialog/oauth");
  u.searchParams.set("client_id", config.meta.appId);
  u.searchParams.set("redirect_uri", config.meta.redirectUri);
  u.searchParams.set("scope", config.meta.scopes);
  u.searchParams.set("response_type", "code");
  return NextResponse.redirect(u.toString());
}
