import { NextResponse } from "next/server";

import { completeConnectAction } from "@/actions/connections";
import { oauthRedirectUri } from "@/lib/publishing/env";
import type { Provider } from "@/lib/publishing/oauth";

/**
 * master.txt 3.5. Both providers return to a route of this shape.
 *
 * The callback never renders application UI: it redirects to a fixed
 * `/dashboard/connections?notice=...` path with a short code, so a provider
 * cannot inject a URL into the browser and the member still ends up somewhere
 * useful whether the attempt worked or not.
 */

const NOTICE_MESSAGES: Record<string, string> = {
  connected: "Account connected.",
  no_profiles: "No Pages you can post to were found on that account.",
  declined: "The authorization was declined.",
  bad_state: "That authorization request could not be verified. Start again.",
  expired: "That authorization request expired. Start again.",
  failed: "The connection could not be completed.",
};

function notice(code: string, detail?: string): string {
  const base = NOTICE_MESSAGES[code] ?? NOTICE_MESSAGES.failed!;
  const trimmed = detail?.trim();

  // Provider error text is echoed for diagnosis but length-capped, and the code
  // is what actually travels in the URL.
  return trimmed ? `${base} (${trimmed.slice(0, 300)})` : base;
}

export async function handleProviderCallback(
  request: Request,
  provider: Provider,
): Promise<NextResponse> {
  const url = new URL(request.url);
  const destination = new URL("/dashboard/connections", url.origin);

  // The redirect URI sent to the provider must match this one exactly, so it is
  // derived from the same helper the authorize step used.
  const origin =
    process.env.APP_URL?.replace(/\/$/, "") ??
    // APP_URL is preferred, but a request-derived origin keeps a local run
    // working; it is wrong behind a proxy that rewrites the host, which is why
    // APP_URL exists.
    url.origin;

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const providerErrorDescription = url.searchParams.get("error_description");

  if (providerError) {
    destination.searchParams.set("notice", notice("declined", providerErrorDescription ?? providerError));

    return NextResponse.redirect(destination);
  }

  try {
    const result = await completeConnectAction({
      state,
      code,
      // `state` and `receivedState` are the two sides of the same value; the
      // action rejects when they differ, which is the CSRF check.
      receivedState: state,
      error: providerError,
      errorDescription: providerErrorDescription,
      redirectUri: oauthRedirectUri(provider, origin),
    });

    if (result.ok) {
      destination.searchParams.set(
        "notice",
        notice("connected", `${result.profiles} page(s); ${result.connected} new, ${result.disconnected} reconnected`),
      );
    } else {
      destination.searchParams.set("notice", notice("failed", result.error));
    }
  } catch {
    destination.searchParams.set("notice", notice("failed"));
  }

  return NextResponse.redirect(destination);
}
