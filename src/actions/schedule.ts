"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { assertPermission, requireWorkspace, AuthorizationError } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/activity";
import { notifyUsers } from "@/lib/notifications";
import { formError, type FormState } from "@/lib/form-state";
import {
  moveTargetSchema,
  reassignTargetSchema,
  scheduleTargetSchema,
  unscheduleTargetSchema,
} from "@/lib/validation/schedule";
import {
  dateKeyOf,
  deriveReminderAt,
  relativeMinutesLabel,
  timeKeyOf,
  toZonedInstant,
} from "@/lib/scheduling";
import { recomputePostStatus } from "@/actions/posts";
import type { PostTargetStatus } from "@/generated/prisma/enums";

/**
 * Phase 2 scheduling actions (master.txt 2.3, 2.4, 2.6).
 *
 * A target is scheduled by writing a wall date, a wall time and the IANA
 * timezone they were typed in, so every action re-derives the instant from all
 * three on the server. The browser's clock is never trusted, and neither is the
 * `date` string a drag-and-drop drop target produced: the input is validated
 * again and the target is re-read to confirm it still belongs to the workspace.
 *
 * Scheduling is a `postManage` capability, the same permission that already
 * creates and edits posts. `targetUpdate` is deliberately not enough - being
 * handed a task is not permission to move everyone else's schedule.
 */

const SCHEDULE_REVALIDATIONS = [
  "/dashboard",
  "/dashboard/calendar",
  "/dashboard/tasks",
  "/dashboard/my-tasks",
  "/dashboard/posts",
] as const;

function revalidateSchedule(postId: string) {
  for (const path of SCHEDULE_REVALIDATIONS) {
    revalidatePath(path);
  }
  revalidatePath(`/dashboard/posts/${postId}`);
}

type ScheduleInput = {
  targetId: string;
  date: string;
  time: string;
  timeZone: string;
  assignedUserId: string | null;
  reminderLeadMinutes: number;
};

/** A target the caller is allowed to reschedule, or a reason they are not. */
async function loadSchedulableTarget(targetId: string, workspaceId: string) {
  const target = await prisma.postTarget.findFirst({
    where: { id: targetId, workspaceId },
    select: {
      id: true,
      postId: true,
      workspaceId: true,
      status: true,
      scheduledAt: true,
      timezone: true,
      assignedUserId: true,
      completedAt: true,
      socialProfile: { select: { id: true, name: true, platform: true } },
      post: { select: { id: true, title: true, status: true } },
    },
  });

  return target;
}

async function assertAssignee(workspaceId: string, userId: string | null) {
  if (!userId) {
    return;
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!member) {
    throw new Error("The selected assignee is not an active member of this workspace.");
  }
}

function readJsonPayload(formData: FormData, field = "payload"): unknown {
  const raw = formData.get(field);

  if (typeof raw !== "string") {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const result: Record<string, string[] | undefined> = {};

  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] = [...(result[key] ?? []), issue.message];
  }

  return result;
}

/**
 * The shared write path behind the editor, the calendar dialog and drag and
 * drop. `patch` is applied on top of the validated input so each caller only has
 * to describe what is different about its own shape.
 */
async function applySchedule(
  formData: FormData,
  schema: typeof scheduleTargetSchema | typeof moveTargetSchema,
  patch: (input: ScheduleInput) => ScheduleInput | Promise<ScheduleInput>,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.postManage);
  } catch (error) {
    return formError(error);
  }

  const parsed = schema.safeParse(readJsonPayload(formData));

  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error.issues) };
  }

  // `moveTargetSchema` has no reminder field: a drag moves the slot and leaves
  // the lead time the target already had.
  const input = await patch({ ...parsed.data, reminderLeadMinutes: 0 } as ScheduleInput);

  const target = await loadSchedulableTarget(input.targetId, context.workspace.id);

  if (!target) {
    return { error: "That task is not in this workspace." };
  }

  if (target.status === "COMPLETED" || target.status === "CANCELLED") {
    return { error: "A finished task cannot be rescheduled." };
  }

  if (target.post.status === "CANCELLED") {
    return { error: "A cancelled post cannot be rescheduled." };
  }

  const scheduledAt = toZonedInstant(input.date, input.time, input.timeZone);

  if (!scheduledAt) {
    return { error: "That date and time do not exist in that timezone." };
  }

  try {
    await assertAssignee(context.workspace.id, input.assignedUserId);

    const previous = target.scheduledAt;
    // A target that is dragged to the past is deliberately allowed: that is how
    // somebody picks up a missed post. The derived status turns it OVERDUE.
    const reminderAt = deriveReminderAt(scheduledAt, input.reminderLeadMinutes);

    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        scheduledAt,
        timezone: input.timeZone,
        reminderAt,
        assignedUserId: input.assignedUserId,
        // A stored OVERDUE only meant "past due"; once it is moved it is pending
        // again, and the derived status re-evaluates from the new instant.
        status: target.status === "OVERDUE" ? ("PENDING" as PostTargetStatus) : target.status,
      },
    });

    await recomputePostStatus(target.postId);
    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "POST_SCHEDULED",
      entityType: "POST_TARGET",
      entityId: target.id,
      summary: `${context.user.name} scheduled "${target.socialProfile.name}"${
        target.post.title ? ` on "${target.post.title}"` : ""
      } for ${input.date} at ${input.time} (${input.timeZone})`,
      metadata: {
        from: previous?.toISOString() ?? null,
        to: scheduledAt.toISOString(),
        reminderLeadMinutes: input.reminderLeadMinutes,
      },
    });

    if (input.assignedUserId && input.assignedUserId !== context.user.id) {
      await notifyUsers({
        workspaceId: context.workspace.id,
        userIds: [input.assignedUserId],
        type: "POST_SCHEDULED",
        title: `Scheduled for you: ${target.socialProfile.name}`,
        body: `${context.user.name} scheduled you for ${input.date} at ${input.time} (${
          input.timeZone
        })${target.post.title ? ` on "${target.post.title}"` : ""}.`,
        entityType: "POST_TARGET",
        entityId: target.id,
      });
    }

    revalidateSchedule(target.postId);

    return {
      ok: true,
      message: `Scheduled for ${input.date} at ${input.time} (${input.timeZone}).${
        input.reminderLeadMinutes > 0
          ? ` Reminder ${relativeMinutesLabel(input.reminderLeadMinutes)}.`
          : ""
      }`,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { error: error.message };
    }

    return formError(error);
  }
}

/** From the post editor: sets the date, time, timezone, reminder and assignee. */
export async function scheduleTargetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return applySchedule(formData, scheduleTargetSchema, (input) => input);
}

/** From a calendar drop target: moves the slot, keeps the existing reminder lead. */
export async function moveTargetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return applySchedule(formData, moveTargetSchema, async (input) => {
    const existing = await prisma.postTarget.findUnique({
      where: { id: input.targetId },
      select: { reminderAt: true, scheduledAt: true },
    });

    const lead = existing?.reminderAt && existing.scheduledAt
      ? Math.round((existing.scheduledAt.getTime() - existing.reminderAt.getTime()) / 60_000)
      : 0;

    return { ...input, reminderLeadMinutes: Math.max(0, lead) };
  });
}

/**
 * master.txt 2.4: clearing the schedule. Reminders go with it, and a target that
 * was only ever PENDING returns to the unscheduled backlog rather than leaving a
 * stale OVERDUE behind.
 */
export async function unscheduleTargetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.postManage);
  } catch (error) {
    return formError(error);
  }

  const parsed = unscheduleTargetSchema.safeParse(readJsonPayload(formData));

  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error.issues) };
  }

  const target = await loadSchedulableTarget(parsed.data.targetId, context.workspace.id);

  if (!target) {
    return { error: "That task is not in this workspace." };
  }

  if (target.status === "COMPLETED" || target.status === "CANCELLED") {
    return { error: "A finished task cannot be unscheduled." };
  }

  try {
    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        scheduledAt: null,
        reminderAt: null,
        timezone: null,
        // PENDING is the unscheduled state; OVERDUE only ever meant "past due".
        status: target.status === "OVERDUE" ? "PENDING" : undefined,
      },
    });

    await recomputePostStatus(target.postId);
    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "POST_UPDATED",
      entityType: "POST_TARGET",
      entityId: target.id,
      summary: `${context.user.name} unscheduled "${target.socialProfile.name}"`,
    });

    revalidateSchedule(target.postId);

    return { ok: true, message: "Schedule cleared." };
  } catch (error) {
    return formError(error);
  }
}

/** master.txt 2.6: reassigning from the calendar, the task list or a target row. */
export async function reassignTargetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.postManage);
  } catch (error) {
    return formError(error);
  }

  const parsed = reassignTargetSchema.safeParse(readJsonPayload(formData));

  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error.issues) };
  }

  const input = parsed.data;
  const target = await loadSchedulableTarget(input.targetId, context.workspace.id);

  if (!target) {
    return { error: "That task is not in this workspace." };
  }

  if (target.assignedUserId === input.assignedUserId) {
    return { ok: true, message: "No change." };
  }

  try {
    await assertAssignee(context.workspace.id, input.assignedUserId);

    await prisma.postTarget.update({
      where: { id: target.id },
      data: { assignedUserId: input.assignedUserId },
    });

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "POST_TARGET_STATUS_CHANGED",
      entityType: "POST_TARGET",
      entityId: target.id,
      summary: `${context.user.name} reassigned "${target.socialProfile.name}"`,
      metadata: { from: target.assignedUserId, to: input.assignedUserId },
    });

    if (input.assignedUserId && input.assignedUserId !== context.user.id) {
      await notifyUsers({
        workspaceId: context.workspace.id,
        userIds: [input.assignedUserId],
        type: "POST_ASSIGNED",
        title: `Assigned to you: ${target.socialProfile.name}`,
        body: `${context.user.name} assigned you a post${
          target.post.title ? ` "${target.post.title}"` : ""
        }.`,
        entityType: "POST_TARGET",
        entityId: target.id,
      });
    }

    revalidateSchedule(target.postId);

    return { ok: true, message: "Assignee updated." };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { error: error.message };
    }

    return formError(error);
  }
}

/**
 * Called by a client effect once a day transition has happened, so a reminder
 * lands as an in-app notification without anything scheduling itself in the
 * background. The `findFirst` guard is what makes it fire exactly once per
 * reminder, even though the effect runs on every navigation.
 */
export async function deliverDueRemindersAction(): Promise<{ delivered: number }> {
  // Every role that can sign in may see their own reminders, so this is the
  // weakest read permission rather than a scheduling one.
  const { workspace, user } = await requireWorkspace();
  const now = new Date();

  const due = await prisma.postTarget.findMany({
    where: {
      workspaceId: workspace.id,
      assignedUserId: user.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      reminderAt: { not: null, lte: now },
      scheduledAt: { not: null, gt: now },
    },
    orderBy: { reminderAt: "asc" },
    take: 20,
    select: {
      id: true,
      postId: true,
      reminderAt: true,
      scheduledAt: true,
      timezone: true,
      socialProfile: { select: { name: true } },
      post: { select: { title: true } },
    },
  });

  let delivered = 0;

  for (const target of due) {
    const timeZone = target.timezone ?? workspace.timezone;
    const lead = Math.round(
      (target.scheduledAt!.getTime() - target.reminderAt!.getTime()) / 60_000,
    );
    const already = await prisma.notification.findFirst({
      where: {
        workspaceId: workspace.id,
        userId: user.id,
        entityType: "POST_TARGET",
        entityId: target.id,
        type: "POST_SCHEDULED",
        createdAt: { gte: target.reminderAt! },
      },
      select: { id: true },
    });

    if (already) {
      continue;
    }

    await prisma.notification.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        type: "POST_SCHEDULED",
        title: `${target.socialProfile.name} is scheduled ${relativeMinutesLabel(lead)}`,
        body: `${target.post.title ?? "Untitled post"} goes out at ${timeKeyOf(
          target.scheduledAt!,
          timeZone,
        )} (${timeZone}) on ${dateKeyOf(target.scheduledAt!, timeZone)}.`,
        entityType: "POST_TARGET",
        entityId: target.id,
      },
    });

    delivered += 1;
  }

  if (delivered > 0) {
    revalidatePath("/dashboard");
  }

  // The caller refreshes only when something was actually delivered, otherwise
  // a runner mounted on every layout would refresh in a loop.
  return { delivered };
}
