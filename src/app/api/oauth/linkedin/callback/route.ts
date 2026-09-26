import { NextResponse } from "next/server";

import { handleProviderCallback } from "@/lib/publishing/oauth-callback";

/**
 * LinkedIn OAuth callback. The redirect URI registered with the app must be
 * `{APP_URL}/api/oauth/linkedin/callback`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleProviderCallback(request, "LINKEDIN");
}
