import { randomBytes, createHash } from "node:crypto";

import { PublishError } from "@/lib/publishing/errors";
import {
  exchangeForLongLivedToken,
  listMetaPages,
  META_GRAPH_VERSION,
  META_LOGIN_PERMISSIONS,
  type MetaPage,
} from "@/lib/publishing/meta";
import {
  LINKEDIN_LOGIN_SCOPES,
  listLinkedInOrganizations,
  type LinkedInOrganization,
} from "@/lib/publishing/linkedin";

/**
 * master.txt 3.5. Both providers are driven through the same three steps:
 *
 *   1. The app redirects the member to the provider with a `state` we stored
 *      server-side, plus PKCE where the provider supports it.
 *   2. The callback exchanges the code for tokens. The code is single-use and
 *      short-lived, so nothing is persisted from the redirect itself.
 *   3. Only the long-lived credential is stored, encrypted. Page/organisation
 *      credentials are deliberately not stored: they expire in about an hour and
 *      are re-derived per attempt.
 *
 * The `state` row is the whole CSRF defence, so it is created before the
 * redirect and destroyed on use.
 */

export type Provider = "META" | "LINKEDIN";

export type DiscoveredProfile = {
  /** Facebook Page id or LinkedIn organization id. */
  providerProfileId: string;
  name: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  /** True when this member can actually create content on it. */
  canPublish: boolean;
};

/** 32 random bytes, base64url — well above the 43-char minimum for S256. */
export function createCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createState(): string {
  return randomBytes(32).toString("base64url");
}

export function authorizationUrl(params: {
  provider: Provider;
  state: string;
  redirectUri: string;
  codeVerifier?: string;
  appId: string;
}): string {
  if (params.provider === "META") {
    const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);

    url.searchParams.set("client_id", params.appId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("state", params.state);
    // A Page token is only issued for a user token, and the long-lived exchange
    // later on needs the long-lived user token, so ask for the 60-day one now.
    url.searchParams.set("access_type", "offline");

    return url.toString();
  }

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");

  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", LINKEDIN_LOGIN_SCOPES);

  // LinkedIn supports PKCE with S256; sending it is required for the flow to be
  // accepted as confidential-client capable.
  if (params.codeVerifier) {
    url.searchParams.set("code_challenge", codeChallengeFromVerifier(params.codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
  }

  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

async function postForm(url: string, fields: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(20_000),
  });

  const body = (await response.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    // The description can name a scope, so it is safe and useful to show. The
    // response never contains a token on failure.
    throw new Error(
      `The provider rejected the token exchange: ${
        body.error_description ?? body.error ?? `HTTP ${response.status}`
      }`,
    );
  }

  return body;
}

export type ConnectedCredential = {
  accessToken: string;
  refreshToken: string | null;
  /** Null when the provider does not say. */
  expiresAt: Date | null;
  scopes: string[];
};

async function exchangeMetaCode(params: {
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
}): Promise<ConnectedCredential> {
  const short = await postForm(`https://graph.facebook.com/v26.0/oauth/access_token`, {
    client_id: params.appId,
    client_secret: params.appSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
  });

  // A Page token from /me/accounts lasts about an hour and there is no refresh
  // token, so the only way this connection survives is the long-lived user token.
  const long = await exchangeForLongLivedToken(short.access_token, params.appId, params.appSecret);

  return {
    accessToken: long.token,
    refreshToken: null,
    expiresAt: long.expiresInSeconds ? new Date(Date.now() + long.expiresInSeconds * 1000) : null,
    scopes: META_LOGIN_PERMISSIONS.split(","),
  };
}

async function exchangeLinkedInCode(params: {
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
  codeVerifier: string;
}): Promise<ConnectedCredential> {
  const token = await postForm("https://www.linkedin.com/oauth/v2/accessToken", {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.appId,
    client_secret: params.appSecret,
    code_verifier: params.codeVerifier,
  });

  return {
    accessToken: token.access_token,
    // LinkedIn only issues a refresh token when `offline_access` was requested.
    // That scope is not needed to publish, and the 60-day token re-connect
    // flow is the supported recovery, so a null here is expected.
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
    scopes: token.scope ? token.scope.split(/\s+/) : [...LINKEDIN_LOGIN_SCOPES.split(",")],
  };
}

export async function exchangeCode(params: {
  provider: Provider;
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
  codeVerifier?: string;
}): Promise<ConnectedCredential> {
  if (params.provider === "META") {
    return exchangeMetaCode(params);
  }

  if (!params.codeVerifier) {
    throw new Error("LinkedIn requires the PKCE verifier that was created with the state.");
  }

  return exchangeLinkedInCode(params as typeof params & { codeVerifier: string });
}

export async function discoverProfiles(
  provider: Provider,
  accessToken: string,
): Promise<DiscoveredProfile[]> {
  if (provider === "META") {
    const pages: MetaPage[] = await listMetaPages(accessToken);

    return pages.map((page) => ({
      providerProfileId: page.id,
      name: page.name,
      avatarUrl: page.picture?.data?.url ?? null,
      profileUrl: page.link ?? `https://www.facebook.com/${page.id}`,
      canPublish: page.tasks.includes("CREATE_CONTENT"),
    }));
  }

  const organizations: LinkedInOrganization[] = await listLinkedInOrganizations(accessToken);

  return organizations.map((organization) => ({
    providerProfileId: organization.id,
    name: organization.name || `Organization ${organization.id}`,
    avatarUrl: null,
    profileUrl: `https://www.linkedin.com/company/${organization.id}`,
    // Publishing needs ADMINISTRATOR or CONTENT_ADMINISTRATOR; other roles can
    // read the Page but not post to it.
    canPublish: organization.role === "ADMINISTRATOR" || organization.role === "CONTENT_ADMINISTRATOR",
  }));
}

/**
 * A short-lived credential for one attempt, for one specific profile.
 *
 * Facebook hands out Page tokens from `/me/accounts` that expire in about an
 * hour, so they are re-derived every time rather than stored. The right token is
 * selected by Page id: a connection can cover several Pages, and publishing a
 * post to the wrong one would be worse than not publishing at all.
 *
 * LinkedIn has no page-scoped token — the Posts API accepts the member token
 * directly, scoped to the organization named in the post body.
 */
export async function shortLivedPublishToken(params: {
  provider: Provider;
  storedAccessToken: string;
  providerProfileId: string;
}): Promise<string> {
  if (params.provider === "LINKEDIN") {
    return params.storedAccessToken;
  }

  const pages = await listMetaPages(params.storedAccessToken);
  const match = pages.find((page) => page.id === params.providerProfileId);

  if (!match) {
    const ids = pages.map((page) => page.id);

    throw new PublishError({
      kind: "PERMANENT",
      code: "PAGE_NOT_MANAGED",
      message:
        `This connection cannot post to the Facebook Page ${params.providerProfileId}. ` +
        `It manages: ${ids.length > 0 ? ids.join(", ") : "no pages"}. Reconnect the account and grant access to that Page.`,
    });
  }

  return match.accessToken;
}
