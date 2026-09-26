import { PublishError } from "@/lib/publishing/errors";
import type { PublishOutcome, PublishRequest } from "@/lib/publishing/types";

/**
 * LinkedIn Posts API, organisation publishing.
 *
 * Verified against LinkedIn's current documentation:
 *   - API version 202609, sent on every request as `Linkedin-Version`.
 *   - `POST https://api.linkedin.com/rest/posts` returns 201; the new post's
 *     identifier comes back in the `x-restli-id` / `x-linkedin-id` headers,
 *     and `x-restli-id` is the canonical URN to store.
 *   - Author must be an organization URN: `urn:li:organization:{id}`, which
 *     requires the `w_organization_social` scope and an approved
 *     Community Management API application.
 *   - An image is uploaded separately: `POST /rest/images?action=initializeUpload`
 *     returns a presigned `uploadUrl` plus the image URN to reference from the
 *     post body. The bytes then go to `uploadUrl` with a plain PUT.
 *
 * Video and document posts need further scopes and a multi-request chunked
 * upload, so they are reported unsupported rather than half-implemented.
 */

export const LINKEDIN_API_VERSION = "202609";
const API_BASE = "https://api.linkedin.com/rest";

export const LINKEDIN_SCOPES = ["w_organization_social", "r_organization_social"] as const;
export const LINKEDIN_LOGIN_SCOPES = LINKEDIN_SCOPES.join(",");

export type LinkedInOrganization = {
  id: string;
  name: string;
  urn: string;
  role?: string;
};

type LinkedInErrorBody = {
  serviceErrorCode?: number;
  status?: number;
  message?: string;
  path?: string;
};

function classify(httpStatus: number, serviceErrorCode: number | undefined): PublishError["kind"] {
  // 401 always means the token is gone: the member re-authorised without the
  // scope, revoked the app, or the 60-day token aged out. The app is also denied
  // for Community Management API access in some cases, which also surfaces as
  // 401 on the resources endpoints.
  if (httpStatus === 401) return "REAUTH";
  if (httpStatus === 403) return "PERMANENT";
  if (httpStatus === 429) return "TRANSIENT";
  if (httpStatus >= 500) return "TRANSIENT";
  if (httpStatus === 400 || httpStatus === 404 || httpStatus === 409) return "PERMANENT";

  // A service error code with an unremarkable status is usually a rate limit
  // (CODE 8) or a temporary upstream problem.
  if (serviceErrorCode === 8) return "TRANSIENT";

  return httpStatus >= 500 ? "TRANSIENT" : "PERMANENT";
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 15 * 60_000);
  }

  return null;
}

async function linkedinError(response: Response, context: string): Promise<PublishError> {
  let body: LinkedInErrorBody = {};

  try {
    body = (await response.json()) as LinkedInErrorBody;
  } catch {
    // LinkedIn returns an empty body on some gateway failures.
  }

  return new PublishError({
    kind: classify(response.status, body.serviceErrorCode),
    code: body.serviceErrorCode !== undefined ? String(body.serviceErrorCode) : `HTTP_${response.status}`,
    httpStatus: response.status,
    retryAfterMs: parseRetryAfter(response.headers.get("retry-after") ?? response.headers.get("x-restli-retry-after")),
    message: `${context}: ${body.message ?? response.statusText ?? `HTTP ${response.status}`}`,
  });
}

function apiHeaders(accessToken: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    ...extra,
  };
}

function organizationUrn(id: string): string {
  return id.startsWith("urn:li:organization:") ? id : `urn:li:organization:${id}`;
}

/** Upload the image bytes and return the URN to reference from the post. */
async function uploadLinkedInImage(
  request: PublishRequest,
  image: PublishRequest["media"][number],
): Promise<string> {
  const initialize = await fetch(
    `${API_BASE}/images?action=initializeUpload`,
    {
      method: "POST",
      headers: apiHeaders(request.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: organizationUrn(request.providerProfileId),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!initialize.ok) {
    throw await linkedinError(initialize, "LinkedIn image upload authorisation");
  }

  const { value } = (await initialize.json()) as {
    value?: { uploadUrl?: string; image?: string };
  };

  if (!value?.uploadUrl || !value.image) {
    throw new PublishError({
      kind: "TRANSIENT",
      code: "NO_UPLOAD_URL",
      message: "LinkedIn did not return an image upload URL.",
    });
  }

  const bytes = await image.bytes();

  // The presigned URL is already authorised, so LinkedIn's own headers are not
  // sent here and adding them invalidates the signature.
  const upload = await fetch(value.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": image.contentType },
    body: bytes as BlobPart,
    signal: AbortSignal.timeout(120_000),
  });

  if (!upload.ok) {
    throw new PublishError({
      kind: upload.status >= 500 || upload.status === 429 ? "TRANSIENT" : "PERMANENT",
      code: `UPLOAD_${upload.status}`,
      httpStatus: upload.status,
      message: `LinkedIn rejected the image upload (HTTP ${upload.status}).`,
    });
  }

  return value.image;
}

export async function publishToLinkedIn(request: PublishRequest): Promise<PublishOutcome> {
  const image = request.media.find((item) => item.kind === "IMAGE");

  if (request.media.length > 1 || (request.media.length === 1 && !image)) {
    throw new PublishError({
      kind: "PERMANENT",
      code: "UNSUPPORTED_MEDIA",
      message:
        "LinkedIn publishing in this phase supports text and a single image. " +
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

  const imageUrn = image ? await uploadLinkedInImage(request, image) : null;

  const response = await fetch(`${API_BASE}/posts`, {
    method: "POST",
    headers: apiHeaders(request.accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      author: organizationUrn(request.providerProfileId),
      commentary: request.text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(imageUrn
        ? { content: { media: { id: imageUrn } } }
        : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok && response.status !== 201) {
    throw await linkedinError(response, "LinkedIn post");
  }

  // The created post's identity lives in the headers, not the body.
  const urn = response.headers.get("x-restli-id") ?? response.headers.get("x-linkedin-id");

  if (!urn) {
    throw new PublishError({
      kind: "TRANSIENT",
      code: "NO_POST_URN",
      message: "LinkedIn accepted the post but returned no post URN.",
    });
  }

  return {
    providerPostId: urn,
    providerUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}`,
    raw: { urn, status: response.status },
  };
}

/**
 * GET /rest/organizationAcls?q=roleAssignee&roleAssignee={memberUrn}
 *
 * Lists the organisations the authorised member administers, which is how the
 * connection picker finds candidate organisation pages without asking the
 * member to type an id.
 */
export async function listLinkedInOrganizations(accessToken: string): Promise<LinkedInOrganization[]> {
  const response = await fetch(
    `${API_BASE}/organizationAcls?q=roleAssignee`,
    {
      headers: apiHeaders(accessToken),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    throw await linkedinError(response, "LinkedIn organisation discovery");
  }

  const body = (await response.json()) as {
    elements?: Array<{
      organization?: string;
      role?: string;
      "organization-details"?: { name?: string };
    }>;
  };

  return (body.elements ?? [])
    .map((element) => ({
      id: (element.organization ?? "").replace("urn:li:organization:", ""),
      urn: element.organization ?? "",
      name: element["organization-details"]?.name ?? "",
      role: element.role,
    }))
    .filter((organization) => organization.id.length > 0);
}

/** GET /rest/organizations/{id} — the name to show in the picker. */
export async function getLinkedInOrganization(
  accessToken: string,
  organizationId: string,
): Promise<{ id: string; name: string }> {
  const response = await fetch(`${API_BASE}/organizations/${organizationId}`, {
    headers: apiHeaders(accessToken),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw await linkedinError(response, "LinkedIn organisation lookup");
  }

  return (await response.json()) as { id: string; name: string };
}
