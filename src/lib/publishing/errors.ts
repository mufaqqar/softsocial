/**
 * master.txt 3.9. Two kinds of provider failure, and getting the split right is
 * the difference between a queue that recovers and a queue that hammers a
 * revoked token three times for every scheduled post.
 *
 * Permanent: retrying cannot help. An invalid token, a missing permission, a
 * deleted Page or media the provider will not accept. The job stops and the
 * target is left needing a human.
 *
 * Transient: the same request may well succeed later. Rate limits, timeouts and
 * 5xx responses. These are the only ones that consume an attempt.
 */

export type PublishErrorKind = "PERMANENT" | "TRANSIENT" | "REAUTH" | "BLOCKED";

export class PublishError extends Error {
  readonly kind: PublishErrorKind;
  readonly code: string;
  /** Provider error subcode, kept separately because it disambiguates. */
  readonly subcode: number | null;
  readonly httpStatus: number | null;
  readonly retryAfterMs: number | null;

  constructor(init: {
    kind: PublishErrorKind;
    code: string;
    message: string;
    subcode?: number | null;
    httpStatus?: number | null;
    retryAfterMs?: number | null;
  }) {
    super(init.message);
    this.name = "PublishError";
    this.kind = init.kind;
    this.code = init.code;
    this.subcode = init.subcode ?? null;
    this.httpStatus = init.httpStatus ?? null;
    this.retryAfterMs = init.retryAfterMs ?? null;
  }

  get isRetryable() {
    return this.kind === "TRANSIENT";
  }

  /** Set when the failure means the stored credential must be replaced. */
  get needsReauth() {
    return this.kind === "REAUTH";
  }
}

export function isPublishError(error: unknown): error is PublishError {
  return error instanceof PublishError;
}

/** Anything that is not a PublishError is treated as transient and retried. */
export function toPublishError(error: unknown): PublishError {
  if (isPublishError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new PublishError({ kind: "TRANSIENT", code: "UNKNOWN", message });
}

/**
 * master.txt 3.9: attempt 1 after 30s, attempt 2 after 2 minutes, attempt 3
 * after 10 minutes. BullMQ applies this as the backoff delay for `attempts: 3`.
 */
export const PUBLISH_BACKOFF_MS = 30_000;
export const PUBLISH_MAX_ATTEMPTS = 3;
