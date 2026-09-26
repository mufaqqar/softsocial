import type { PostStatus, PostTargetStatus } from "@/generated/prisma/enums";

/**
 * master.txt 3.11. The post's status is derived from its targets rather than set
 * by the publishing pipeline, so the two cannot drift apart.
 *
 * Two design points that matter:
 *
 * `PUBLISHED` on a target is Phase 3 only. Phase 1/2 records a hand-published
 * target as `COMPLETED`, and a target still waiting for a human is `PENDING` or
 * `OVERDUE`. So a `PUBLISHED` target always means automation has acted, which is
 * what makes PARTIALLY_PUBLISHED trustworthy.
 *
 * A post whose targets are all still in the Phase 1/2 states is left completely
 * alone. The worker calls this on every publish, and without that guard a
 * scheduled post waiting on a human would silently change status.
 */

const AUTOMATED_TARGET_STATUSES: readonly PostTargetStatus[] = [
  "QUEUED",
  "PROCESSING",
  "PUBLISHED",
  "BLOCKED",
  "FAILED",
];

export type TargetSnapshot = {
  status: PostTargetStatus;
  retryCount: number;
  completedAt?: Date | null;
};

export type DerivedStatus = {
  status: PostStatus;
  /** Targets that reached PUBLISHED. */
  published: number;
  /** Targets in a terminal failure state. */
  failed: number;
  /** Targets still to be attempted. */
  pending: number;
};

/** True once anything about this target was touched by automatic publishing. */
export function isAutomatedTargetStatus(status: PostTargetStatus): boolean {
  return AUTOMATED_TARGET_STATUSES.includes(status);
}

/**
 * `currentStatus` is returned unchanged when the post has no automated target,
 * which makes this safe to call from anywhere in the Phase 3 path.
 */
export function derivePostStatus(
  targets: readonly TargetSnapshot[],
  currentStatus: PostStatus,
): DerivedStatus {
  const published = targets.filter((target) => target.status === "PUBLISHED").length;
  const failed = targets.filter((target) => target.status === "FAILED").length;
  const pending = Math.max(0, targets.length - published - failed);

  if (targets.length === 0) {
    return { status: currentStatus, published: 0, failed: 0, pending: 0 };
  }

  if (!targets.some((target) => isAutomatedTargetStatus(target.status))) {
    return { status: currentStatus, published: 0, failed: 0, pending: targets.length };
  }

  const anyQueued = targets.some((target) => target.status === "QUEUED");
  const anyProcessing = targets.some((target) => target.status === "PROCESSING");
  const anyBlocked = targets.some((target) => target.status === "BLOCKED");

  let status: PostStatus;

  if (failed === targets.length) {
    // All of them gave up. Distinguish "the provider will never accept this"
    // from "we have retries left", because only one is a dead end.
    status = targets.every((target) => target.retryCount >= 3) ? "FAILED" : "PROCESSING";
  } else if (anyQueued || anyProcessing) {
    status = "PROCESSING";
  } else if (anyBlocked) {
    // Blocked outranks everything except an actual failure: no amount of
    // retrying moves a post whose credential has to be replaced by a human.
    status = "BLOCKED";
  } else if (published > 0 && published < targets.length) {
    // The point of PARTIALLY_PUBLISHED, and it outranks a manual or overdue
    // sibling: the post is already half out, so re-queuing it wholesale would
    // duplicate the part that went live.
    status = "PARTIALLY_PUBLISHED";
  } else if (published === targets.length) {
    status = "PUBLISHED";
  } else {
    // An automated target exists but nothing is in flight: either the rest are
    // still waiting for a human, or they were cancelled.
    status = "IN_PROGRESS";
  }

  return { status, published, failed, pending };
}

/** True when the worker should not pick this target up again. */
export function isTerminalTargetStatus(status: PostTargetStatus): boolean {
  return status === "PUBLISHED" || status === "FAILED" || status === "BLOCKED";
}

/**
 * A post publishes once it has been approved. PROCESSING and PARTIALLY_PUBLISHED
 * are included so a rescheduled or retried target on an already-running post
 * still goes out.
 */
export function isReadyToPublish(status: PostStatus): boolean {
  return (
    status === "APPROVED" ||
    status === "SCHEDULED" ||
    status === "IN_PROGRESS" ||
    status === "PROCESSING" ||
    status === "PARTIALLY_PUBLISHED"
  );
}
