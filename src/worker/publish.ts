import { PublishError, toPublishError, PUBLISH_MAX_ATTEMPTS } from "@/lib/publishing/errors";
import { publish as publishTo } from "@/lib/publishing/dispatch";
import type { PublishMedia } from "@/lib/publishing/types";
import { recomputePostStatus } from "@/lib/publishing/recompute";
import { decryptSecret } from "@/lib/crypto/token-crypto";
import { shortLivedPublishToken } from "@/lib/publishing/oauth";
import { workerPrisma as prisma, workerStorage as storage } from "@/worker/runtime";
import type { SocialPlatform } from "@/generated/prisma/enums";

/**
 * master.txt 3.7, the publish pipeline. The order below is the whole contract:
 *
 *   1. Claim the job atomically. A row-level conditional update means two workers
 *      racing on the same target produce exactly one publish.
 *   2. Re-check idempotency. A worker that crashed after the provider accepted
 *      the post must not publish again on the next attempt.
 *   3. Build the request from the database. Nothing comes from the queue payload
 *      beyond ids.
 *   4. Take a short-lived credential for this attempt.
 *   5. Publish, then record the attempt, the provider id, and the permalink.
 *   6. Recompute the post status from its targets.
 *
 * A transient failure is rethrown so BullMQ applies the 30s / 2m / 10m backoff.
 * A permanent failure is recorded and swallowed, because retrying it would only
 * produce the same rejection.
 */

export type RunJobInput = {
  postTargetId: string;
  workerId: string;
  /** 1-based, for the PublishAttempt row. */
  attempt: number;
};

async function log(input: {
  workspaceId: string;
  postId: string;
  postTargetId?: string;
  level: "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
}) {
  await prisma.publishLog
    .create({
      data: {
        workspaceId: input.workspaceId,
        postId: input.postId,
        postTargetId: input.postTargetId ?? null,
        level: input.level,
        message: input.message,
        context: (input.context ?? null) as never,
      },
    })
    .catch(() => undefined);
}

/** Media bytes are read lazily so a text-only post never touches storage. */
async function buildMedia(postId: string): Promise<PublishMedia[]> {
  const rows = await prisma.postMedia.findMany({
    where: { postId, socialProfileId: null },
    orderBy: { position: "asc" },
    include: { media: { select: { id: true, storageKey: true, mimeType: true } } },
  });

  return rows.map((row) => ({
    kind: "IMAGE" as const,
    mediaId: row.media.id,
    contentType: row.media.mimeType,
    bytes: async () => {
      const bytes = await storage.get(row.media.storageKey);

      if (!bytes) {
        // A missing object is a permanent problem, not something a retry fixes.
        throw new PublishError({
          kind: "PERMANENT",
          code: "MEDIA_MISSING",
          message: "The attached image is no longer in storage. Replace it and retry.",
        });
      }

      return new Uint8Array(bytes);
    },
  }));
}

export async function runPublishJob(input: RunJobInput): Promise<void> {
  const { postTargetId, workerId, attempt } = input;

  const job = await prisma.publishJob.findUnique({
    where: { postTargetId },
    select: { id: true, postId: true, workspaceId: true, status: true },
  });

  if (!job) {
    // The post or target was deleted. Nothing to do and nothing to retry.
    return;
  }

  // 1. Atomic claim. Only the transition out of a claimable state succeeds, so a
  // second worker sees count 0 and leaves.
  const claim = await prisma.publishJob.updateMany({
    where: { postTargetId, status: { in: ["PENDING", "ACTIVE"] } },
    data: { status: "ACTIVE", lockedAt: new Date(), lockedBy: workerId, attempts: attempt },
  });

  if (claim.count === 0) {
    await log({
      workspaceId: job.workspaceId,
      postId: job.postId,
      postTargetId,
      level: "info",
      message: "Job was already claimed by another worker; skipping.",
    });

    return;
  }

  const target = await prisma.postTarget.findUnique({
    where: { id: postTargetId },
    select: {
      id: true,
      postId: true,
      workspaceId: true,
      status: true,
      providerPostId: true,
      retryCount: true,
      socialProfile: {
        select: {
          id: true,
          name: true,
          platform: true,
          provider: true,
          providerProfileId: true,
          socialConnectionId: true,
        },
      },
    },
  });

  if (!target) {
    await prisma.publishJob.update({
      where: { postTargetId },
      data: { status: "CANCELLED", completedAt: new Date() },
    });

    return;
  }

  // 2. Idempotency. This is the check that makes a crashed worker safe.
  if (target.providerPostId || target.status === "PUBLISHED") {
    await prisma.publishJob.update({
      where: { postTargetId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await log({
      workspaceId: job.workspaceId,
      postId: job.postId,
      postTargetId,
      level: "info",
      message: "Target already carries a provider post id; not publishing again.",
    });

    return;
  }

  const profile = target.socialProfile;

  if (!profile?.socialConnectionId || !profile.providerProfileId || !profile.provider) {
    await failPermanently({
      input,
      job,
      code: "NO_CONNECTION",
      message: "This profile is not connected to a provider.",
    });

    return;
  }

  const connection = await prisma.socialConnection.findFirst({
    where: { id: profile.socialConnectionId, workspaceId: job.workspaceId },
    select: { id: true, provider: true, status: true, accessTokenEncrypted: true },
  });

  if (!connection?.accessTokenEncrypted) {
    await failPermanently({
      input,
      job,
      code: "NO_CREDENTIAL",
      message: "The connection for this profile has no stored credential.",
    });

    return;
  }

  if (connection.status === "DISCONNECTED") {
    await failPermanently({
      input,
      job,
      code: "DISCONNECTED",
      message: "The connection for this profile was disconnected.",
    });

    return;
  }

  // Mark the target as in flight so the UI shows progress and a second enqueue
  // cannot pick it up.
  await prisma.postTarget.update({
    where: { id: target.id },
    data: { status: "PROCESSING" },
  });

  const post = await prisma.post.findUnique({
    where: { id: job.postId },
    select: {
      id: true,
      content: true,
      variants: { select: { platform: true, text: true } },
    },
  });

  const platform = profile.platform as SocialPlatform;
  const variant = post?.variants.find((item) => item.platform === platform);
  const text = (variant?.text || post?.content || "").trim();
  const media = await buildMedia(job.postId);
  const startedAt = Date.now();

  try {
    // 3 + 4. Resolve the credential for this attempt, then publish. A
    // decryption failure means the row was encrypted under a different
    // ENCRYPTION_KEY, which no amount of retrying can fix.
    let accessToken: string;

    try {
      accessToken = await shortLivedPublishToken({
        provider: connection.provider === "LINKEDIN" ? "LINKEDIN" : "META",
        storedAccessToken: decryptSecret(connection.accessTokenEncrypted),
        providerProfileId: profile.providerProfileId,
      });
    } catch (credentialError) {
      throw new PublishError({
        kind: "REAUTH",
        code: "TOKEN_UNREADABLE",
        message:
          credentialError instanceof Error
            ? `The stored credential could not be read: ${credentialError.message}`
            : "The stored credential could not be read.",
      });
    }

    const outcome = await publishTo({
      platform,
      providerProfileId: profile.providerProfileId,
      text,
      media,
      accessToken,
      postId: job.postId,
    });

    // 5. Success.
    await prisma.$transaction([
      prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          providerPostId: outcome.providerPostId,
          providerUrl: outcome.providerUrl,
          errorCode: null,
          errorMessage: null,
        },
      }),
      prisma.publishAttempt.create({
        data: {
          workspaceId: job.workspaceId,
          postId: job.postId,
          postTargetId: target.id,
          socialProfileId: profile.id,
          platform,
          jobId: job.id,
          attempt,
          result: "SUCCESS",
          providerPostId: outcome.providerPostId,
          providerResponseId: outcome.providerPostId,
          durationMs: Date.now() - startedAt,
        },
      }),
      prisma.publishJob.update({
        where: { postTargetId },
        data: { status: "COMPLETED", completedAt: new Date(), lastErrorCode: null, lastError: null },
      }),
    ]);

    await prisma.socialConnection.update({
      where: { id: connection.id },
      data: { lastUsedAt: new Date() },
    });

    // 6.
    await recomputePostStatus(prisma, job.postId);

    await log({
      workspaceId: job.workspaceId,
      postId: job.postId,
      postTargetId: target.id,
      level: "info",
      message: `Published to ${profile.name}.`,
      context: { providerPostId: outcome.providerPostId },
    });
  } catch (error) {
    await handleFailure({
      error,
      input,
      job,
      target: { id: target.id, retryCount: target.retryCount },
      connectionId: connection.id,
      profileId: profile.id,
      profileName: profile.name,
      platform,
      durationMs: Date.now() - startedAt,
    });
  }
}

async function failPermanently(params: {
  input: RunJobInput;
  job: { id: string; postId: string; workspaceId: string };
  code: string;
  message: string;
}) {
  const { input, job } = params;

  await prisma.$transaction([
    prisma.postTarget.update({
      where: { id: input.postTargetId },
      data: { status: "FAILED", errorCode: params.code, errorMessage: params.message },
    }),
    prisma.publishJob.update({
      where: { postTargetId: input.postTargetId },
      data: { status: "DEAD", completedAt: new Date(), lastErrorCode: params.code, lastError: params.message },
    }),
  ]);

  await log({
    workspaceId: job.workspaceId,
    postId: job.postId,
    postTargetId: input.postTargetId,
    level: "error",
    message: params.message,
    context: { code: params.code },
  });

  await recomputePostStatus(prisma, job.postId);
}

async function handleFailure(params: {
  error: unknown;
  input: RunJobInput;
  job: { id: string; postId: string; workspaceId: string };
  target: { id: string; retryCount: number };
  connectionId: string;
  profileId: string;
  profileName: string;
  platform: SocialPlatform;
  durationMs: number;
}) {
  const { error, input, job, target, connectionId } = params;
  const failure = toPublishError(error);
  const retriesLeft = input.attempt < PUBLISH_MAX_ATTEMPTS;

  await prisma.publishAttempt.create({
    data: {
      workspaceId: job.workspaceId,
      postId: job.postId,
      postTargetId: target.id,
      socialProfileId: params.profileId,
      platform: params.platform,
      jobId: job.id,
      attempt: input.attempt,
      result: "FAILURE",
      errorCode: failure.code,
      errorMessage: failure.message.slice(0, 1000),
      durationMs: params.durationMs,
    },
  });

  if (failure.needsReauth) {
    // The credential is gone. Everything queued on this connection will fail the
    // same way, so the connection is flagged rather than retried target by target.
    await prisma.socialConnection.update({
      where: { id: connectionId },
      data: { status: "REAUTH_REQUIRED" },
    });

    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        status: "BLOCKED",
        errorCode: failure.code,
        errorMessage: `${failure.message} Reconnect ${params.profileName} to resume publishing.`,
        retryCount: target.retryCount + 1,
      },
    });

    await prisma.publishJob.update({
      where: { postTargetId: input.postTargetId },
      data: { status: "DEAD", completedAt: new Date(), lastErrorCode: failure.code, lastError: failure.message },
    });

    await log({
      workspaceId: job.workspaceId,
      postId: job.postId,
      postTargetId: target.id,
      level: "error",
      message: `Reconnect required for ${params.profileName}.`,
      context: { code: failure.code, subcode: failure.subcode },
    });

    await recomputePostStatus(prisma, job.postId);

    return;
  }

  if (failure.isRetryable && retriesLeft) {
    // Back to QUEUED so the UI does not claim it is in flight while it waits
    // out the backoff, and let BullMQ schedule the next attempt.
    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        status: "QUEUED",
        errorCode: failure.code,
        errorMessage: failure.message.slice(0, 1000),
        retryCount: target.retryCount + 1,
      },
    });

    await prisma.publishJob.update({
      where: { postTargetId: input.postTargetId },
      data: { status: "PENDING", lastErrorCode: failure.code, lastError: failure.message.slice(0, 1000) },
    });

    await log({
      workspaceId: job.workspaceId,
      postId: job.postId,
      postTargetId: target.id,
      level: "warn",
      message: `Attempt ${input.attempt} failed for ${params.profileName}; retrying.`,
      context: { code: failure.code, retryAfterMs: failure.retryAfterMs },
    });

    await recomputePostStatus(prisma, job.postId);

    // Rethrowing is what makes BullMQ apply the backoff.
    throw failure;
  }

  // Out of retries, or a permanent rejection.
  await prisma.postTarget.update({
    where: { id: target.id },
    data: {
      status: "FAILED",
      errorCode: failure.code,
      errorMessage: failure.message.slice(0, 1000),
      retryCount: target.retryCount + 1,
    },
  });

  await prisma.publishJob.update({
    where: { postTargetId: input.postTargetId },
    data: {
      status: "DEAD",
      completedAt: new Date(),
      lastErrorCode: failure.code,
      lastError: failure.message.slice(0, 1000),
    },
  });

  await log({
    workspaceId: job.workspaceId,
    postId: job.postId,
    postTargetId: target.id,
    level: "error",
    message: retriesLeft
      ? `${params.profileName} rejected the post permanently.`
      : `Out of retries for ${params.profileName}.`,
    context: { code: failure.code, subcode: failure.subcode, kind: failure.kind },
  });

  await recomputePostStatus(prisma, job.postId);

  // Permanent failures are not rethrown: the job is done and retrying would only
  // earn the same rejection.
  if (failure.isRetryable) {
    throw failure;
  }
}

export { PublishError };
