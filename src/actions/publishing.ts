"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireWorkspace, assertPermission } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { planPublishJobs, type PlanTarget } from "@/lib/publishing/enqueue";
import {
  cancelPublishJob,
  enqueuePublishJob,
  reschedulePublishJob,
} from "@/lib/queue/publish-queue";
import { isAutomatedTargetStatus } from "@/lib/publishing/status";

/**
 * The bridge between the app and the queue (master.txt 3.8).
 *
 * Two invariants hold here:
 *
 * - Redis is not the source of truth. `PublishJob` is written first, so a Redis
 *   outage loses a queue entry but never the intent to publish, and the
 *   reconciler can re-enqueue from the database.
 * - A target whose profile is not connected is marked BLOCKED rather than
 *   enqueued, because the worker has no credential to use and would fail the job
 *   three times for a reason no retry can fix.
 */

export type SyncOutcome = {
  enqueued: number;
  skipped: number;
  blocked: number;
  queueUnavailable: boolean;
  messages: string[];
};

async function claimableTargets(postId: string, workspaceId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, workspaceId },
    select: {
      id: true,
      status: true,
      workspaceId: true,
      media: { select: { mediaId: true }, orderBy: { position: "asc" } },
      targets: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          providerPostId: true,
          socialProfile: { select: { socialConnectionId: true } },
          jobs: { select: { id: true, status: true } },
        },
      },
    },
  });

  return post;
}

export async function syncPostPublishJobs(postId: string): Promise<SyncOutcome> {
  const { workspace } = await requireWorkspace();
  const post = await claimableTargets(postId, workspace.id);

  if (!post) {
    return { enqueued: 0, skipped: 0, blocked: 0, queueUnavailable: false, messages: [] };
  }

  const mediaIds = post.media.map((row) => row.mediaId);

  const planTargets: PlanTarget[] = post.targets.map((target) => ({
    id: target.id,
    status: target.status,
    scheduledAt: target.scheduledAt,
    providerPostId: target.providerPostId,
    socialConnectionId: target.socialProfile?.socialConnectionId ?? null,
    hasActiveJob: target.jobs.some(
      (job) => job.status === "PENDING" || job.status === "ACTIVE",
    ),
  }));

  const actions = planPublishJobs({
    postStatus: post.status,
    postId: post.id,
    workspaceId: workspace.id,
    targets: planTargets,
    mediaIds,
  });

  let enqueued = 0;
  let skipped = 0;
  let blocked = 0;
  let queueUnavailable = false;
  const messages: string[] = [];

  for (const action of actions) {
    if (action.kind === "SKIP") {
      if (action.reason === "NO_CONNECTION") {
        // Hold the target visibly instead of burning retries on it.
        await prisma.postTarget.update({
          where: { id: action.postTargetId },
          data: {
            status: "BLOCKED",
            errorCode: "NO_CONNECTION",
            errorMessage:
              "This profile is not connected to a provider. Connect it, or publish this post by hand.",
          },
        });
        blocked += 1;
      } else if (action.reason !== "MANUAL") {
        skipped += 1;
      }

      continue;
    }

    // Persist the intent before touching Redis.
    await prisma.publishJob.upsert({
      where: { postTargetId: action.postTargetId },
      create: {
        workspaceId: workspace.id,
        postId: post.id,
        postTargetId: action.postTargetId,
        status: "PENDING",
        runAt: action.runAt,
      },
      update: { status: "PENDING", runAt: action.runAt, completedAt: null, lastError: null, lastErrorCode: null },
    });

    try {
      const jobId = await enqueuePublishJob(
        {
          postTargetId: action.postTargetId,
          postId: post.id,
          workspaceId: workspace.id,
          mediaIds: action.mediaIds,
        },
        action.runAt,
      );

      await prisma.publishJob.update({
        where: { postTargetId: action.postTargetId },
        data: { status: "ACTIVE", runAt: action.runAt },
      });

      enqueued += 1;
      messages.push(`Queued for publishing (job ${jobId ?? action.postTargetId}).`);
    } catch {
      // The job row stays PENDING, so this is recoverable by a later sync.
      queueUnavailable = true;
      messages.push(
        "The publish queue is not reachable, so this post is recorded but not queued yet. It will be picked up when the queue returns.",
      );
      break;
    }
  }

  return { enqueued, skipped, blocked, queueUnavailable, messages };
}

/**
 * Called when a schedule changes. A delayed BullMQ job cannot be moved, so the
 * old one is replaced. `force` is for an explicit reschedule or a retry, where
 * a target that is already QUEUED should be re-planned.
 */
export async function rescheduleTargetJob(
  postTargetId: string,
  options: { force?: boolean } = {},
): Promise<SyncOutcome> {
  const { workspace } = await requireWorkspace();

  const target = await prisma.postTarget.findFirst({
    where: { id: postTargetId, workspaceId: workspace.id },
    select: {
      id: true,
      postId: true,
      status: true,
      scheduledAt: true,
      providerPostId: true,
      socialProfile: { select: { socialConnectionId: true } },
      post: { select: { status: true, media: { select: { mediaId: true }, orderBy: { position: "asc" } } } },
    },
  });

  if (!target || !target.scheduledAt) {
    return { enqueued: 0, skipped: 0, blocked: 0, queueUnavailable: false, messages: [] };
  }

  if (!options.force && isAutomatedTargetStatus(target.status) && target.status !== "QUEUED") {
    // Leave a target that is mid-publish alone.
    return { enqueued: 0, skipped: 0, blocked: 0, queueUnavailable: false, messages: [] };
  }

  await prisma.publishJob.upsert({
    where: { postTargetId: target.id },
    create: {
      workspaceId: workspace.id,
      postId: target.postId,
      postTargetId: target.id,
      status: "PENDING",
      runAt: target.scheduledAt,
    },
    update: { status: "PENDING", runAt: target.scheduledAt, completedAt: null },
  });

  try {
    await reschedulePublishJob(
      {
        postTargetId: target.id,
        postId: target.postId,
        workspaceId: workspace.id,
        mediaIds: target.post.media.map((row) => row.mediaId),
      },
      target.scheduledAt,
    );
  } catch {
    return {
      enqueued: 0,
      skipped: 0,
      blocked: 0,
      queueUnavailable: true,
      messages: ["The publish queue is not reachable. The new time is saved and will be queued when it returns."],
    };
  }

  return { enqueued: 1, skipped: 0, blocked: 0, queueUnavailable: false, messages: [] };
}

/** Removes the Redis job and the row when a post is cancelled or unscheduled. */
export async function cancelTargetJob(postTargetId: string): Promise<void> {
  const { workspace } = await requireWorkspace();

  const target = await prisma.postTarget.findFirst({
    where: { id: postTargetId, workspaceId: workspace.id },
    select: { id: true, postId: true, status: true, providerPostId: true },
  });

  if (!target) {
    return;
  }

  // Never cancel something that already went out.
  if (target.providerPostId || target.status === "PUBLISHED") {
    return;
  }

  await cancelPublishJob(target.id).catch(() => undefined);

  await prisma.publishJob.updateMany({
    where: { postTargetId: target.id, status: { in: ["PENDING", "ACTIVE"] } },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  revalidatePath(`/posts/${target.postId}`);
}

/**
 * Re-arms a failed or blocked target by hand. `retryCount` is reset so the
 * 30s/2m/10m schedule starts over, which is the point of an explicit retry.
 */
export async function retryPublishAction(postTargetId: string): Promise<{ ok: boolean; message: string }> {
  const { workspace } = await requireWorkspace();
  await assertPermission(PERMISSIONS.publishRetry);

  const target = await prisma.postTarget.findFirst({
    where: { id: postTargetId, workspaceId: workspace.id },
    select: {
      id: true,
      postId: true,
      status: true,
      scheduledAt: true,
      providerPostId: true,
      socialProfile: { select: { name: true, socialConnectionId: true } },
    },
  });

  if (!target) {
    return { ok: false, message: "That post target no longer exists." };
  }

  if (target.providerPostId || target.status === "PUBLISHED") {
    return { ok: false, message: "This target has already been published." };
  }

  if (!target.socialProfile?.socialConnectionId) {
    return {
      ok: false,
      message: "Connect this profile to a provider before retrying.",
    };
  }

  const now = new Date();
  await prisma.postTarget.update({
    where: { id: target.id },
    data: {
      status: "QUEUED",
      retryCount: 0,
      errorCode: null,
      errorMessage: null,
      // Retry now rather than at a time that has already passed.
      scheduledAt: target.scheduledAt && target.scheduledAt > now ? target.scheduledAt : now,
    },
  });

  const outcome = await rescheduleTargetJob(target.id, { force: true });

  revalidatePath(`/posts/${target.postId}`);
  revalidatePath("/dashboard/posts");

  return outcome.queueUnavailable
    ? { ok: false, message: outcome.messages[0] ?? "The publish queue is not reachable." }
    : { ok: true, message: "Queued for publishing again." };
}
