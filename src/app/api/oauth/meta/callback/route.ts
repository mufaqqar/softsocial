import { NextResponse } from "next/server";

import { handleProviderCallback } from "@/lib/publishing/oauth-callback";

/**
 * Meta OAuth callback. The redirect URI registered with the app must be
 * `{APP_URL}/api/oauth/meta/callback`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleProviderCallback(request, "META");
}
