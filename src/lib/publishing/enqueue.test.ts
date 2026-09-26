import { describe, expect, it } from "vitest";

import { planPublishJobs, SKIP_MESSAGES, type PlanTarget } from "@/lib/publishing/enqueue";

const RUN_AT = new Date("2026-10-01T09:00:00.000Z");

function target(overrides: Partial<PlanTarget> = {}): PlanTarget {
  return {
    id: "t1",
    status: "QUEUED",
    scheduledAt: RUN_AT,
    providerPostId: null,
    socialConnectionId: "conn-1",
    hasActiveJob: false,
    ...overrides,
  };
}

const base = {
  postId: "p1",
  workspaceId: "w1",
  mediaIds: ["m1", "m2"],
};

describe("planPublishJobs", () => {
  it("returns nothing for a post with no targets", () => {
    expect(planPublishJobs({ ...base, postStatus: "APPROVED", targets: [] })).toEqual([]);
  });

  it("enqueues an approved, scheduled, connected target", () => {
    const actions = planPublishJobs({ ...base, postStatus: "APPROVED", targets: [target()] });

    expect(actions).toEqual([
      { kind: "ENQUEUE", postTargetId: "t1", runAt: RUN_AT, mediaIds: ["m1", "m2"] },
    ]);
  });

  it("copies the media ids so the payload cannot be mutated later", () => {
    const mediaIds = ["m1"];
    const [action] = planPublishJobs({ ...base, postStatus: "APPROVED", mediaIds, targets: [target()] });

    expect(action).toMatchObject({ kind: "ENQUEUE" });
    if (action?.kind === "ENQUEUE") {
      expect(action.mediaIds).not.toBe(mediaIds);
    }
  });

  it("never re-publishes a target that already has a provider post id", () => {
    const actions = planPublishJobs({
      ...base,
      postStatus: "APPROVED",
      targets: [target({ providerPostId: "fb_123" })],
    });

    expect(actions[0]).toEqual({ kind: "SKIP", postTargetId: "t1", reason: "ALREADY_PUBLISHED" });
  });

  it("treats a PUBLISHED target as already published even without an id", () => {
    const actions = planPublishJobs({
      ...base,
      postStatus: "APPROVED",
      targets: [target({ status: "PUBLISHED" })],
    });

    expect(actions[0]).toMatchObject({ reason: "ALREADY_PUBLISHED" });
  });

  it("checks idempotency before anything else", () => {
    // A published target that is also unconnected and unscheduled still resolves
    // to ALREADY_PUBLISHED.
    const actions = planPublishJobs({
      ...base,
      postStatus: "DRAFT",
      targets: [
        target({ providerPostId: "x", socialConnectionId: null, scheduledAt: null, status: "PUBLISHED" }),
      ],
    });

    expect(actions[0]).toMatchObject({ reason: "ALREADY_PUBLISHED" });
  });

  it("holds back a target with no provider connection", () => {
    const actions = planPublishJobs({
      ...base,
      postStatus: "APPROVED",
      targets: [target({ socialConnectionId: null })],
    });

    expect(actions[0]).toMatchObject({ reason: "NO_CONNECTION" });
  });

  it("holds back an unscheduled target", () => {
    const actions = planPublishJobs({
      ...base,
      postStatus: "APPROVED",
      targets: [target({ scheduledAt: null })],
    });

    expect(actions[0]).toMatchObject({ reason: "NOT_SCHEDULED" });
  });

  it("holds back an unapproved post", () => {
    for (const status of ["DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED", "PUBLISHED"] as const) {
      const actions = planPublishJobs({ ...base, postStatus: status, targets: [target()] });

      expect(actions[0], `post status ${status}`).toMatchObject({ reason: "NOT_APPROVED" });
    }
  });

  it("does not double-enqueue a target that already has a job", () => {
    const actions = planPublishJobs({
      ...base,
      postStatus: "APPROVED",
      targets: [target({ hasActiveJob: true })],
    });

    expect(actions[0]).toMatchObject({ reason: "ALREADY_QUEUED" });
  });

  it("leaves a BLOCKED target alone until it is reconnected", () => {
    const actions = planPublishJobs({
      ...base,
      postStatus: "APPROVED",
      targets: [target({ status: "BLOCKED" })],
    });

    expect(actions[0]).toMatchObject({ reason: "BLOCKED" });
  });

  it("does not auto-retry a failed target from the scheduler", () => {
    const actions = planPublishJobs({
      ...base,
      postStatus: "APPROVED",
      targets: [target({ status: "FAILED" })],
    });

    expect(actions[0]).toMatchObject({ kind: "SKIP" });
  });

  it("keeps Phase 1 and 2 manual targets on the manual flow", () => {
    for (const status of ["PENDING", "OVERDUE", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const) {
      const actions = planPublishJobs({ ...base, postStatus: "APPROVED", targets: [target({ status })] });

      expect(actions[0], `target status ${status}`).toMatchObject({ reason: "MANUAL" });
    }
  });

  it("plans each target independently, preserving order", () => {
    const actions = planPublishJobs({
      ...base,
      postStatus: "APPROVED",
      targets: [
        target({ id: "a" }),
        target({ id: "b", socialConnectionId: null }),
        target({ id: "c", providerPostId: "done" }),
        target({ id: "d" }),
      ],
    });

    expect(actions.map((action) => action.postTargetId)).toEqual(["a", "b", "c", "d"]);
    expect(actions.map((action) => action.kind)).toEqual(["ENQUEUE", "SKIP", "SKIP", "ENQUEUE"]);
  });

  it("covers every target with exactly one action", () => {
    const targets = [
      target({ id: "a" }),
      target({ id: "b", status: "PUBLISHED" }),
      target({ id: "c", scheduledAt: null }),
      target({ id: "d", status: "FAILED" }),
    ];
    const actions = planPublishJobs({ ...base, postStatus: "APPROVED", targets });

    expect(actions).toHaveLength(targets.length);
  });

  it("has a message for every skip reason", () => {
    for (const reason of Object.keys(SKIP_MESSAGES)) {
      expect(SKIP_MESSAGES[reason as keyof typeof SKIP_MESSAGES]).toBeTruthy();
    }
  });
});
