import type { PostStatus, PostTargetStatus } from "@/generated/prisma/enums";
import { isReadyToPublish } from "@/lib/publishing/status";

/**
 * master.txt 3.7/3.8. Deciding what to enqueue is kept separate from enqueueing
 * so the rules are testable without Redis and so the same rules can be applied
 * by the scheduler, by a post edit, and by a manual retry.
 *
 * The central rule is idempotency: a target that already has `providerPostId` is
 * never published again, no matter how this function is reached. That is the
 * single guarantee that a double-click, a re-save, or a worker that crashed
 * just after the provider accepted the post cannot produce a duplicate.
 */

export type PlanTarget = {
  id: string;
  status: PostTargetStatus;
  scheduledAt: Date | null;
  providerPostId: string | null;
  /** Null for a Phase 1 manual profile that has never been connected. */
  socialConnectionId: string | null;
  /** A job already exists for this target. */
  hasActiveJob: boolean;
};

export type PlanInput = {
  postStatus: PostStatus;
  postId: string;
  workspaceId: string;
  targets: readonly PlanTarget[];
  mediaIds: readonly string[];
};

export type PlanAction =
  | { kind: "ENQUEUE"; postTargetId: string; runAt: Date; mediaIds: string[] }
  /** The target cannot be published and the reason shown in the UI. */
  | { kind: "SKIP"; postTargetId: string; reason: SkipReason };

export type SkipReason =
  | "ALREADY_PUBLISHED"
  | "ALREADY_QUEUED"
  | "NOT_SCHEDULED"
  | "NOT_APPROVED"
  | "NO_CONNECTION"
  | "BLOCKED"
  | "MANUAL"
  | "IN_PROGRESS";

const MANUAL_STATUSES: readonly PostTargetStatus[] = [
  // A target with no automation attached: Phase 1/2 records a hand-published
  // target as COMPLETED, and a target still waiting for a human as PENDING or
  // OVERDUE. Neither should ever be picked up by the queue.
  "PENDING",
  "OVERDUE",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

/**
 * Returns one action per target, in input order. Callers turn the ENQUEUE
 * actions into Redis jobs and the SKIP actions into UI messages.
 */
export function planPublishJobs(input: PlanInput): PlanAction[] {
  const { postStatus, targets } = input;

  if (targets.length === 0) {
    return [];
  }

  return targets.map((target): PlanAction => {
    // Idempotency first: nothing below may override a target that is already out.
    if (target.providerPostId || target.status === "PUBLISHED") {
      return { kind: "SKIP", postTargetId: target.id, reason: "ALREADY_PUBLISHED" };
    }

    if (target.status === "BLOCKED") {
      return { kind: "SKIP", postTargetId: target.id, reason: "BLOCKED" };
    }

    if (target.status === "FAILED") {
      // A failed target is only retried on request, never by the scheduler.
      return { kind: "SKIP", postTargetId: target.id, reason: "IN_PROGRESS" };
    }

    if (!target.socialConnectionId) {
      return { kind: "SKIP", postTargetId: target.id, reason: "NO_CONNECTION" };
    }

    if (!target.scheduledAt) {
      return { kind: "SKIP", postTargetId: target.id, reason: "NOT_SCHEDULED" };
    }

    if (MANUAL_STATUSES.includes(target.status)) {
      return { kind: "SKIP", postTargetId: target.id, reason: "MANUAL" };
    }

    if (!isReadyToPublish(postStatus)) {
      return { kind: "SKIP", postTargetId: target.id, reason: "NOT_APPROVED" };
    }

    if (target.hasActiveJob) {
      return { kind: "SKIP", postTargetId: target.id, reason: "ALREADY_QUEUED" };
    }

    return {
      kind: "ENQUEUE",
      postTargetId: target.id,
      runAt: target.scheduledAt,
      mediaIds: [...input.mediaIds],
    };
  });
}

export const SKIP_MESSAGES: Record<SkipReason, string> = {
  ALREADY_PUBLISHED: "Already published.",
  ALREADY_QUEUED: "Already queued for publishing.",
  NOT_SCHEDULED: "No publish time set.",
  NOT_APPROVED: "The post has not been approved yet.",
  NO_CONNECTION: "This profile is not connected to a provider. Connect it or publish by hand.",
  BLOCKED: "Publishing is blocked for this profile until it is reconnected.",
  MANUAL: "This target is still marked for manual publishing.",
  IN_PROGRESS: "This target is mid-publish; use Retry to try it again.",
};

/** Text used when a target has to be held back for a reason worth reporting. */
export function explainSkip(action: Extract<PlanAction, { kind: "SKIP" }>): string {
  return SKIP_MESSAGES[action.reason];
}
