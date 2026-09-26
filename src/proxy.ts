import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "softsocial.session";

/**
 * Cheap redirect layer only.
 *
 * The presence of the session cookie is *not* an authorisation decision: the
 * cookie is a signed token that still has to be checked against the Session
 * table. Every page and Server Action does that through the DAL
 * (`requireSession` / `requireWorkspace`). This file only avoids rendering a
 * protected page for a visitor who obviously has no cookie.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/dashboard") && !hasSessionCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // `/onboarding` is deliberately absent: a signed-in user with no workspace has
  // to be able to reach it, and the page itself redirects to /dashboard once a
  // workspace exists. Sending it back to /dashboard here would loop.
  if (hasSessionCookie && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
