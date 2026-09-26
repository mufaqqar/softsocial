import { describe, expect, it } from "vitest";

import {
  derivePostStatus,
  isAutomatedTargetStatus,
  isReadyToPublish,
  isTerminalTargetStatus,
} from "@/lib/publishing/status";
import type { PostStatus, PostTargetStatus } from "@/generated/prisma/enums";

const target = (status: PostTargetStatus, retryCount = 0) => ({
  status,
  retryCount,
  completedAt: status === "PUBLISHED" ? new Date() : null,
});

describe("derivePostStatus", () => {
  it("leaves a Phase 1/2 post completely alone", () => {
    // No automated target anywhere: the worker must not touch this post.
    expect(derivePostStatus([target("PENDING"), target("OVERDUE")], "SCHEDULED").status).toBe("SCHEDULED");
    expect(derivePostStatus([target("COMPLETED")], "IN_PROGRESS").status).toBe("IN_PROGRESS");
    expect(derivePostStatus([target("PENDING")], "MANUAL_PENDING").status).toBe("MANUAL_PENDING");
  });

  it("returns the current status for a post with no targets", () => {
    expect(derivePostStatus([], "DRAFT").status).toBe("DRAFT");
  });

  it("is PUBLISHED only when every target is published", () => {
    expect(derivePostStatus([target("PUBLISHED"), target("PUBLISHED")], "APPROVED").status).toBe("PUBLISHED");
    expect(derivePostStatus([target("PUBLISHED")], "APPROVED").status).toBe("PUBLISHED");
  });

  it("is PARTIALLY_PUBLISHED when some are out and the rest are not", () => {
    const result = derivePostStatus([target("PUBLISHED"), target("PENDING")], "APPROVED");

    expect(result.status).toBe("PARTIALLY_PUBLISHED");
    expect(result.published).toBe(1);
    expect(result.pending).toBe(1);
  });

  it("is never PARTIALLY_PUBLISHED for a single target", () => {
    expect(derivePostStatus([target("PUBLISHED")], "APPROVED").status).toBe("PUBLISHED");
    expect(derivePostStatus([target("FAILED", 3)], "APPROVED").status).toBe("FAILED");
    expect(derivePostStatus([target("BLOCKED")], "APPROVED").status).toBe("BLOCKED");
    // A lone manual target is not automated at all, so the post is untouched.
    expect(derivePostStatus([target("PENDING")], "APPROVED").status).toBe("APPROVED");
  });

  it("is PROCESSING while anything is queued or in flight", () => {
    expect(derivePostStatus([target("PUBLISHED"), target("QUEUED")], "APPROVED").status).toBe("PROCESSING");
    expect(derivePostStatus([target("PROCESSING")], "APPROVED").status).toBe("PROCESSING");
  });

  it("is FAILED when every target exhausted its retries", () => {
    const result = derivePostStatus([target("FAILED", 3), target("FAILED", 3)], "APPROVED");

    expect(result.status).toBe("FAILED");
    expect(result.failed).toBe(2);
  });

  it("stays PROCESSING while a failed target still has retries", () => {
    expect(derivePostStatus([target("FAILED", 1)], "APPROVED").status).toBe("PROCESSING");
    expect(derivePostStatus([target("FAILED", 2)], "APPROVED").status).toBe("PROCESSING");
  });

  it("is PARTIALLY_PUBLISHED when one target went out and another gave up", () => {
    expect(derivePostStatus([target("PUBLISHED"), target("FAILED", 3)], "APPROVED").status).toBe("PARTIALLY_PUBLISHED");
  });

  it("lets BLOCKED win because the queue cannot progress", () => {
    expect(derivePostStatus([target("PUBLISHED"), target("BLOCKED")], "APPROVED").status).toBe("BLOCKED");
    expect(derivePostStatus([target("BLOCKED")], "APPROVED").status).toBe("BLOCKED");
  });

  it("does not let BLOCKED mask a total failure", () => {
    expect(derivePostStatus([target("FAILED", 3), target("FAILED", 3)], "APPROVED").status).toBe("FAILED");
  });

  it("falls back to IN_PROGRESS when an automated target has no work left", () => {
    expect(derivePostStatus([target("PUBLISHED"), target("CANCELLED")], "APPROVED").status).toBe("PARTIALLY_PUBLISHED");
    expect(derivePostStatus([target("PUBLISHED"), target("COMPLETED")], "APPROVED").status).toBe("PARTIALLY_PUBLISHED");
  });

  it("counts published, failed and pending exactly once each", () => {
    const result = derivePostStatus(
      [target("PUBLISHED"), target("PUBLISHED"), target("FAILED", 3), target("QUEUED")],
      "APPROVED",
    );

    expect(result).toEqual({ status: "PROCESSING", published: 2, failed: 1, pending: 1 });
  });
});

describe("isAutomatedTargetStatus", () => {
  it("covers only the Phase 3 target states", () => {
    for (const status of ["QUEUED", "PROCESSING", "PUBLISHED", "BLOCKED", "FAILED"] as const) {
      expect(isAutomatedTargetStatus(status), status).toBe(true);
    }

    for (const status of ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"] as const) {
      expect(isAutomatedTargetStatus(status), status).toBe(false);
    }
  });
});

describe("isTerminalTargetStatus", () => {
  it("treats published, failed and blocked as terminal", () => {
    expect(isTerminalTargetStatus("PUBLISHED")).toBe(true);
    expect(isTerminalTargetStatus("FAILED")).toBe(true);
    expect(isTerminalTargetStatus("BLOCKED")).toBe(true);
  });

  it("does not treat in-flight or manual states as terminal", () => {
    expect(isTerminalTargetStatus("QUEUED")).toBe(false);
    expect(isTerminalTargetStatus("PROCESSING")).toBe(false);
    expect(isTerminalTargetStatus("PENDING")).toBe(false);
    expect(isTerminalTargetStatus("OVERDUE")).toBe(false);
  });
});

describe("isReadyToPublish", () => {
  const allowed: PostStatus[] = ["APPROVED", "SCHEDULED", "IN_PROGRESS", "PROCESSING", "PARTIALLY_PUBLISHED"];
  const refused: PostStatus[] = [
    "DRAFT",
    "PENDING_APPROVAL",
    "REJECTED",
    "PUBLISHED",
    "CANCELLED",
    "COMPLETED",
    "FAILED",
    "BLOCKED",
    "MANUAL_PENDING",
  ];

  it("allows approved, scheduled and already-running posts", () => {
    for (const status of allowed) {
      expect(isReadyToPublish(status), status).toBe(true);
    }
  });

  it("refuses drafts, published, cancelled and failed posts", () => {
    for (const status of refused) {
      expect(isReadyToPublish(status), status).toBe(false);
    }
  });
});
