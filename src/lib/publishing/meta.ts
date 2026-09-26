import { PublishError } from "@/lib/publishing/errors";
import type { PublishOutcome, PublishRequest } from "@/lib/publishing/types";

/**
 * Meta Graph API, Pages publishing.
 *
 * Verified against Meta's current documentation:
 *   - Graph API version v26.0 (released 29 July 2026).
 *   - Required permissions: pages_show_list, pages_manage_posts,
 *     pages_manage_metadata (plus pages_read_engagement to read the Page).
 *   - Text:  POST /v26.0/{page-id}/feed      with `message`
 *   - Image: POST /v26.0/{page-id}/photos    with `caption` + `source`
 *   - Page access tokens come from GET /v26.0/me/accounts and are short lived,
 *     so the caller re-derives one per attempt from the stored long-lived user
 *     token.
 *
 * The image is uploaded as raw bytes through `source` rather than by public
 * `url`, because our media is served from an authenticated route that Meta's
 * crawler cannot log in to. master.txt 3.16 forbids pretending media works, so
 * video and multi-image are reported as unsupported instead of attempted.
 */

export const META_GRAPH_VERSION = "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_manage_metadata",
  "pages_read_engagement",
] as const;

export const META_LOGIN_PERMISSIONS = "pages_show_list,pages_manage_posts,pages_manage_metadata,pages_read_engagement";

export type MetaPage = {
  id: string;
  name: string;
  accessToken: string;
  tasks: string[];
  picture?: { data?: { url?: string } };
  link?: string;
};

/** Meta error codes, from the Graph API error-handling and rate-limit guides. */
const REAUTH_CODES = new Set([190, 102]);
const PERMISSION_CODES = new Set([10, 3]);
const PERMANENT_CODES = new Set([
  100, // invalid parameter
  200, // permission (base of the 200-299 range)
  506, // duplicate post
  1609005, // error posting link
]);
const TRANSIENT_CODES = new Set([
  1, // API unknown
  2, // API service
  4, // app rate limit
  17, // user rate limit
  32, // Page rate limit
  341, // application limit reached
  368, // temporarily blocked, Meta says retry
  613, // custom rate limit
  80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014, // business use case
]);

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function classify(code: number | undefined, httpStatus: number): PublishError["kind"] {
  if (code !== undefined) {
    if (REAUTH_CODES.has(code)) return "REAUTH";
    if (PERMISSION_CODES.has(code)) return "PERMANENT";
    if (code >= 200 && code < 300) return "PERMANENT";
    if (PERMANENT_CODES.has(code)) return "PERMANENT";
    if (TRANSIENT_CODES.has(code)) return "TRANSIENT";
  }

  // 429 and 5xx are throttling or a Meta-side problem: both are worth another
  // attempt. Any other 4xx is the request's own fault.
  if (httpStatus === 429 || httpStatus >= 500) return "TRANSIENT";
  if (httpStatus >= 400) return "PERMANENT";

  return "TRANSIENT";
}

async function graphError(response: Response, context: string): Promise<PublishError> {
  let body: GraphErrorBody = {};

  try {
    body = (await response.json()) as GraphErrorBody;
  } catch {
    // A non-JSON error body is still classifiable from the status line.
  }

  const code = body.error?.code;
  const subcode = body.error?.error_subcode ?? null;
  const kind = classify(code, response.status);

  return new PublishError({
    kind,
    code: code !== undefined ? String(code) : `HTTP_${response.status}`,
    subcode,
    httpStatus: response.status,
    message: `${context}: ${body.error?.message ?? `HTTP ${response.status}`}`,
    retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
  });
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 15 * 60_000);
  }

  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/** `form_urlencoded` is what the Pages API expects for a token-scoped call. */
function toForm(fields: Record<string, string>): URLSearchParams {
  return new URLSearchParams(fields);
}

async function call(
  path: string,
  init: RequestInit & { token: string; context: string },
): Promise<Record<string, unknown>> {
  const { token, context, ...requestInit } = init;
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    ...requestInit,
    headers: {
      ...(requestInit.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw await graphError(response, context);
  }

  return (await response.json()) as Record<string, unknown>;
}

/** POST /{page-id}/feed — text, and optionally a link preview. */
export async function publishMetaText(request: PublishRequest): Promise<PublishOutcome> {
  const result = await call(`/${request.providerProfileId}/feed`, {
    method: "POST",
    token: request.accessToken,
    context: "Facebook text post",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toForm({ message: request.text, access_token: request.accessToken }).toString(),
  });

  const id = typeof result.id === "string" ? result.id : null;

  if (!id) {
    throw new PublishError({
      kind: "TRANSIENT",
      code: "NO_POST_ID",
      message: "Facebook accepted the post but returned no post id.",
    });
  }

  return {
    providerPostId: id,
    providerUrl: `https://www.facebook.com/${id}`,
    raw: result,
  };
}

/**
 * POST /{page-id}/photos — one image, uploaded as bytes.
 *
 * `source` carries the raw image, so the file does not need to be publicly
 * reachable. Facebook's own guidance notes that if you are using a Page access
 * token the post appears in the Page's voice, which is what we want.
 */
export async function publishMetaImage(
  request: PublishRequest,
  image: PublishRequest["media"][number],
): Promise<PublishOutcome> {
  const bytes = await image.bytes();
  const form = new FormData();

  form.set("caption", request.text);
  form.set("access_token", request.accessToken);
  form.set("source", new Blob([bytes as BlobPart], { type: image.contentType }), "upload");

  const response = await fetch(`${GRAPH_BASE}/${request.providerProfileId}/photos`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw await graphError(response, "Facebook image post");
  }

  const result = (await response.json()) as { id?: string; post_id?: string };

  if (!result.id && !result.post_id) {
    throw new PublishError({
      kind: "TRANSIENT",
      code: "NO_POST_ID",
      message: "Facebook accepted the image but returned no post id.",
    });
  }

  const postId = result.post_id ?? result.id!;

  return {
    providerPostId: postId,
    providerUrl: `https://www.facebook.com/${postId}`,
    raw: result,
  };
}

/** The single entry point the worker calls. */
export async function publishToFacebook(request: PublishRequest): Promise<PublishOutcome> {
  const image = request.media.find((item) => item.kind === "IMAGE");

  if (request.media.length > 0 && !image) {
    throw new PublishError({
      kind: "PERMANENT",
      code: "UNSUPPORTED_MEDIA",
      message:
        "Facebook publishing in this phase supports text and a single image. " +
        "Publish this post by hand.",
    });
  }

  if (request.media.length > 1) {
    throw new PublishError({
      kind: "PERMANENT",
      code: "UNSUPPORTED_MEDIA",
      message:
        "Facebook does not accept several images in one post through this integration. " +
        "Publish this post by hand.",
    });
  }

  if (!request.text.trim() && !image) {
    throw new PublishError({
      kind: "PERMANENT",
      code: "EMPTY_CONTENT",
      message: "There is no text or image to publish.",
    });
  }

  return image ? publishMetaImage(request, image) : publishMetaText(request);
}

/**
 * GET /me/accounts — the Pages the connected user can post as, each with a
 * short-lived Page access token. Only Pages the user can CREATE_CONTENT on are
 * offered, because anything else will fail at publish time.
 */
export async function listMetaPages(userAccessToken: string): Promise<MetaPage[]> {
  const url = new URL(`${GRAPH_BASE}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,tasks,picture,link");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw await graphError(response, "Meta page discovery");
  }

  const body = (await response.json()) as { data?: MetaPage[] };

  return (body.data ?? []).filter(
    (page) =>
      typeof page.id === "string" &&
      typeof page.accessToken === "string" &&
      page.tasks.includes("CREATE_CONTENT"),
  );
}

/**
 * Exchanges a short-lived user token for a long-lived one. Without this the
 * stored connection would stop working within about an hour, and there is no
 * refresh token on Facebook's side to fall back on — the user has to be the
 * long-lived token's owner. This is why `REAUTH_REQUIRED` exists as a status.
 */
export async function exchangeForLongLivedToken(
  shortLivedUserToken: string,
  appId: string,
  appSecret: string,
): Promise<{ token: string; expiresInSeconds: number | null }> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedUserToken);

  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });

  if (!response.ok) {
    throw await graphError(response, "Meta token exchange");
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };

  if (!body.access_token) {
    throw new PublishError({
      kind: "REAUTH",
      code: "NO_TOKEN",
      message: "Meta did not return an access token for this account.",
    });
  }

  return { token: body.access_token, expiresInSeconds: body.expires_in ?? null };
}
