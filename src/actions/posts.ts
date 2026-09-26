"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { assertPermission, AuthorizationError } from "@/lib/auth/dal";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/activity";
import { notifyUsers, userIdsWithRole } from "@/lib/notifications";
import { formError, type FormState } from "@/lib/form-state";
import {
  commentSchema,
  postSchema,
  targetNoteSchema,
  targetStatusSchema,
  type PostInput,
  type PostTargetInput,
} from "@/lib/validation/post";
import { deriveReminderAt, effectiveTargetStatus, toZonedInstant } from "@/lib/scheduling";
import type { PostStatus, PostTargetStatus } from "@/generated/prisma/enums";

const EDITABLE_STATUSES: PostStatus[] = [
  "DRAFT",
  "MANUAL_PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

/**
 * master.txt 2.8: `SCHEDULED` is derived, never set by hand, so it is
 * deliberately absent from the list of statuses a person may choose.
 */
/**
 * The post editor is a client component, so it serialises its whole state into
 * one hidden field. Everything is still re-validated server-side.
 */
function readPayload(formData: FormData): unknown {
  const raw = formData.get("payload");

  if (typeof raw !== "string") {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string[] | undefined> = {};

  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }

  return fieldErrors;
}

export async function createPostAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.postManage);
  } catch (error) {
    return formError(error);
  }

  const parsed = postSchema.safeParse(readPayload(formData));

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const input: PostInput = parsed.data;

  // Kept outside the try/catch below: `redirect` throws a control-flow error
  // that a broad catch would swallow and turn into a form error.
  let createdPostId: string | null = null;

  try {
    const profileIds = input.targets.map((target) => target.socialProfileId);

    if (new Set(profileIds).size !== profileIds.length) {
      return { error: "The same social profile was selected more than once." };
    }

    const profiles = await prisma.socialProfile.findMany({
      where: { id: { in: profileIds }, workspaceId: context.workspace.id },
      select: { id: true },
    });

    if (profiles.length !== profileIds.length) {
      return { error: "One of the selected social profiles is not in this workspace." };
    }

    const mediaIds = input.mediaIds;
    if (mediaIds.length > 0) {
      const mediaCount = await prisma.media.count({
        where: { id: { in: mediaIds }, workspaceId: context.workspace.id },
      });

      if (mediaCount !== new Set(mediaIds).size) {
        return { error: "One of the selected media files is not in this workspace." };
      }
    }

    if (input.assignedUserId) {
      await assertMember(context.workspace.id, input.assignedUserId);
    }

    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          workspaceId: context.workspace.id,
          title: input.title,
          content: input.content,
          hashtags: input.hashtags,
          notes: input.notes,
          status: input.status,
          createdByUserId: context.user.id,
          updatedByUserId: context.user.id,
          assignedUserId: input.assignedUserId,
        },
        select: { id: true },
      });

      await syncVariants(tx, created.id, input);
      await syncMedia(tx, created.id, mediaIds, context.workspace.id);
      await syncTargets(tx, created.id, context.workspace.id, context.workspace.timezone, input);

      return created;
    });

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "POST_CREATED",
      entityType: "POST",
      entityId: post.id,
      summary: `${context.user.name} created the post${input.title ? ` "${input.title}"` : ""}`,
      metadata: { targets: input.targets.length },
    });

    const assignees = new Set<string>();
    if (input.assignedUserId) {
      assignees.add(input.assignedUserId);
    }
    for (const target of input.targets) {
      if (target.assignedUserId) {
        assignees.add(target.assignedUserId);
      }
    }

    await notifyUsers({
      workspaceId: context.workspace.id,
      userIds: [...assignees].filter((id) => id !== context.user.id),
      type: "POST_ASSIGNED",
      title: `New task${input.title ? `: ${input.title}` : ""}`,
      body: `${context.user.name} assigned you a post to publish manually.`,
      entityType: "POST",
      entityId: post.id,
    });

    // A scheduled target is a different promise from an open one, so the assignee
    // is told the slot as well as the task (master.txt 2.3). Each assignee gets
    // their own line: a post can fan out to profiles scheduled on different days,
    // and repeating the first target's slot to everyone would be a lie.
    const scheduledByAssignee = new Map<string, string[]>();

    for (const target of input.targets) {
      if (!target.scheduledDate || !target.assignedUserId) {
        continue;
      }

      const zone = target.scheduledTimeZone ?? context.workspace.timezone;
      const line = `${target.scheduledDate} at ${target.scheduledTime} (${zone})`;
      const lines = scheduledByAssignee.get(target.assignedUserId);

      if (lines) {
        lines.push(line);
      } else {
        scheduledByAssignee.set(target.assignedUserId, [line]);
      }
    }

    for (const [userId, slots] of scheduledByAssignee) {
      if (userId === context.user.id) {
        continue;
      }

      await notifyUsers({
        workspaceId: context.workspace.id,
        userIds: [userId],
        type: "POST_SCHEDULED",
        title: `Scheduled${input.title ? `: ${input.title}` : ""}`,
        body: `${context.user.name} scheduled you for ${slots.join(", ")}.`,
        entityType: "POST",
        entityId: post.id,
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard/posts");
    createdPostId = post.id;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { error: error.message };
    }

    return formError(error);
  }

  redirect(`/dashboard/posts/${createdPostId}`);
}

export async function updatePostAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.postManage);
  } catch (error) {
    return formError(error);
  }

  const postId = String(formData.get("postId") ?? "");
  const parsed = postSchema.safeParse(readPayload(formData));

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const input: PostInput = parsed.data;

  const existing = await prisma.post.findFirst({
    where: { id: postId, workspaceId: context.workspace.id },
    select: { id: true, status: true },
  });

  if (!existing) {
    return { error: "That post is not in this workspace." };
  }

  if (!EDITABLE_STATUSES.includes(input.status)) {
    return { error: "That status cannot be set manually." };
  }

  try {
    const profileIds = input.targets.map((target) => target.socialProfileId);

    if (new Set(profileIds).size !== profileIds.length) {
      return { error: "The same social profile was selected more than once." };
    }

    const profiles = await prisma.socialProfile.findMany({
      where: { id: { in: profileIds }, workspaceId: context.workspace.id },
      select: { id: true },
    });

    if (profiles.length !== profileIds.length) {
      return { error: "One of the selected social profiles is not in this workspace." };
    }

    if (input.assignedUserId) {
      await assertMember(context.workspace.id, input.assignedUserId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          content: input.content,
          hashtags: input.hashtags,
          notes: input.notes,
          status: input.status,
          updatedByUserId: context.user.id,
          assignedUserId: input.assignedUserId,
        },
      });

      await syncVariants(tx, existing.id, input);
      await syncMedia(tx, existing.id, input.mediaIds, context.workspace.id);
      await syncTargets(tx, existing.id, context.workspace.id, context.workspace.timezone, input);
    });

    const finalStatus = await recomputePostStatus(existing.id, input.status);

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "POST_UPDATED",
      entityType: "POST",
      entityId: existing.id,
      summary: `${context.user.name} updated the post${input.title ? ` "${input.title}"` : ""}`,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard/posts");
    revalidatePath(`/dashboard/posts/${existing.id}`);

    if (finalStatus === "COMPLETED") {
      return { ok: true, message: "Post updated and all targets are complete." };
    }

    return { ok: true, message: "Post updated." };
  } catch (error) {
    return formError(error);
  }
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const context = await assertPermission(PERMISSIONS.postManage);
  const postId = String(formData.get("postId") ?? "");

  const post = await prisma.post.findFirst({
    where: { id: postId, workspaceId: context.workspace.id },
    select: { id: true, title: true },
  });

  if (!post) {
    return;
  }

  await prisma.post.delete({ where: { id: post.id } });

  await recordActivity({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    action: "POST_CANCELLED",
    entityType: "POST",
    entityId: post.id,
    summary: `${context.user.name} deleted the post${post.title ? ` "${post.title}"` : ""}`,
  });

  revalidatePath("/dashboard/posts");
  redirect("/dashboard/posts");
}

/**
 * Phase 1's manual workflow: a member marks each target done after publishing by
 * hand. The post status follows its targets automatically.
 */
export async function setTargetStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.targetUpdate);
  } catch (error) {
    return formError(error);
  }

  const targetId = String(formData.get("targetId") ?? "");
  const parsed = targetStatusSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const status = parsed.data.status as PostTargetStatus;

  const target = await prisma.postTarget.findFirst({
    where: { id: targetId, workspaceId: context.workspace.id },
    select: {
      id: true,
      status: true,
      assignedUserId: true,
      postId: true,
      socialProfile: { select: { name: true, platform: true } },
    },
  });

  if (!target) {
    return { error: "That task is not in this workspace." };
  }

  if (!can(context.permissions, PERMISSIONS.targetUpdateAny)) {
    if (target.assignedUserId !== context.user.id) {
      return { error: "You can only update tasks assigned to you." };
    }

    if (status !== "COMPLETED" && status !== "IN_PROGRESS") {
      return { error: "You can only mark your own task in progress or completed." };
    }
  }

  const isCompleting = status === "COMPLETED";

  try {
    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        status,
        completedAt: isCompleting ? new Date() : status === "PENDING" ? null : undefined,
        completedByUserId: isCompleting ? context.user.id : status === "PENDING" ? null : undefined,
      },
    });

    const postStatus = await recomputePostStatus(target.postId);

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "POST_TARGET_STATUS_CHANGED",
      entityType: "POST_TARGET",
      entityId: target.id,
      summary: `${context.user.name} marked "${target.socialProfile.name}" as ${status.toLowerCase().replace(/_/g, " ")}`,
      metadata: { from: target.status, to: status },
    });

    if (postStatus === "COMPLETED" && target.status !== "COMPLETED") {
      const owners = await userIdsWithRole(context.workspace.id, ["OWNER", "ADMIN"]);
      const post = await prisma.post.findUnique({
        where: { id: target.postId },
        select: { title: true },
      });

      await notifyUsers({
        workspaceId: context.workspace.id,
        userIds: owners.filter((id) => id !== context.user.id),
        type: "POST_PUBLISHED",
        title: `All targets complete${post?.title ? `: ${post.title}` : ""}`,
        body: `${context.user.name} finished the last outstanding target.`,
        entityType: "POST",
        entityId: target.postId,
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/posts");
    revalidatePath(`/dashboard/posts/${target.postId}`);
    revalidatePath("/dashboard/my-tasks");

    return { ok: true, message: `Marked ${target.socialProfile.name} as ${status.toLowerCase().replace(/_/g, " ")}.` };
  } catch (error) {
    return formError(error);
  }
}

export async function setTargetNoteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.targetUpdate);
  } catch (error) {
    return formError(error);
  }

  const targetId = String(formData.get("targetId") ?? "");
  const parsed = targetNoteSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const target = await prisma.postTarget.findFirst({
    where: { id: targetId, workspaceId: context.workspace.id },
    select: { id: true, assignedUserId: true, postId: true },
  });

  if (!target) {
    return { error: "That task is not in this workspace." };
  }

  if (
    !can(context.permissions, PERMISSIONS.targetUpdateAny) &&
    target.assignedUserId !== context.user.id
  ) {
    return { error: "You can only add notes to tasks assigned to you." };
  }

  const notes = parsed.data.notes;

  await prisma.postTarget.update({
    where: { id: target.id },
    data: { notes: notes.length > 0 ? notes : null },
  });

  revalidatePath(`/dashboard/posts/${target.postId}`);
  return { ok: true, message: "Note saved." };
}

export async function addCommentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.postComment);
  } catch (error) {
    return formError(error);
  }

  const parsed = commentSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const input = parsed.data;

  const post = await prisma.post.findFirst({
    where: { id: input.postId, workspaceId: context.workspace.id },
    select: { id: true, title: true },
  });

  if (!post) {
    return { error: "That post is not in this workspace." };
  }

  await prisma.postComment.create({
    data: {
      workspaceId: context.workspace.id,
      postId: post.id,
      userId: context.user.id,
      content: input.content,
    },
  });

  await recordActivity({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    action: "POST_COMMENT_ADDED",
    entityType: "POST",
    entityId: post.id,
    summary: `${context.user.name} commented on ${post.title ? `"${post.title}"` : "a post"}`,
  });

  revalidatePath(`/dashboard/posts/${post.id}`);
  return { ok: true, message: "Comment added." };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Turns the editor's per-target schedule fields into the columns Prisma stores.
 *
 * The zone travels with the date and the time, and it is stored next to the
 * instant: without it the row could not be read back onto the day the author
 * picked. An empty date means the target is not scheduled, which clears all
 * three fields together. A missing zone falls back to the workspace default
 * here rather than in the schema, because only this layer knows it.
 */
function resolveTargetSchedule(
  target: PostTargetInput,
  workspaceTimeZone: string,
): { scheduledAt: Date | null; timezone: string | null; reminderAt: Date | null } {
  if (!target.scheduledDate) {
    return { scheduledAt: null, timezone: null, reminderAt: null };
  }

  const timeZone = target.scheduledTimeZone ?? workspaceTimeZone;
  const scheduledAt = toZonedInstant(target.scheduledDate, target.scheduledTime, timeZone);

  if (!scheduledAt) {
    return { scheduledAt: null, timezone: null, reminderAt: null };
  }

  return {
    scheduledAt,
    timezone: timeZone,
    reminderAt: deriveReminderAt(scheduledAt, target.reminderLeadMinutes),
  };
}

async function syncVariants(tx: Tx, postId: string, input: PostInput) {
  const wanted = input.variants.filter((variant) => variant.text.trim().length > 0);

  await tx.postVariant.deleteMany({
    where: { postId, platform: { notIn: wanted.map((variant) => variant.platform) } },
  });

  for (const variant of wanted) {
    await tx.postVariant.upsert({
      where: { postId_platform: { postId, platform: variant.platform } },
      create: { postId, platform: variant.platform, text: variant.text },
      update: { text: variant.text },
    });
  }
}

async function syncMedia(
  tx: Tx,
  postId: string,
  mediaIds: readonly string[],
  workspaceId: string,
) {
  const unique = [...new Set(mediaIds)];

  await tx.postMedia.deleteMany({ where: { postId, mediaId: { notIn: unique } } });

  for (const [position, mediaId] of unique.entries()) {
    const owned = await tx.media.count({ where: { id: mediaId, workspaceId } });

    if (owned === 0) {
      continue;
    }

    await tx.postMedia.upsert({
      where: { postId_mediaId: { postId, mediaId } },
      create: { postId, mediaId, position },
      update: { position },
    });
  }
}

/**
 * Creates targets for newly selected profiles, updates the assignee and the
 * schedule on existing ones, and removes targets that are still PENDING when a
 * profile is unchecked. Completed history is never deleted.
 *
 * Phase 2 (master.txt 2.1): scheduling is per target, so the editor sends a date,
 * a time, a timezone and a reminder lead for each profile individually and this
 * turns each of them into the instant stored on the row. Clearing the date
 * unschedules the target and drops its reminder together.
 */
async function syncTargets(
  tx: Tx,
  postId: string,
  workspaceId: string,
  workspaceTimeZone: string,
  input: PostInput,
) {
  const existing = await tx.postTarget.findMany({
    where: { postId },
    select: { id: true, socialProfileId: true, assignedUserId: true, status: true },
  });

  const byProfile = new Map(existing.map((target) => [target.socialProfileId, target]));
  const wantedProfileIds = new Set(input.targets.map((target) => target.socialProfileId));

  for (const target of input.targets) {
    const current = byProfile.get(target.socialProfileId);
    const assignedUserId = target.assignedUserId ?? input.assignedUserId ?? null;
    const schedule = resolveTargetSchedule(target, workspaceTimeZone);

    if (current) {
      // A finished target keeps its history: rescheduling it is rejected at the
      // action boundary, so an untouched value must not be overwritten here.
      const finished = current.status === "COMPLETED" || current.status === "CANCELLED";

      await tx.postTarget.update({
        where: { id: current.id },
        data: finished
          ? { assignedUserId }
          : { assignedUserId, ...schedule },
      });
      continue;
    }

    await tx.postTarget.create({
      data: {
        postId,
        workspaceId,
        socialProfileId: target.socialProfileId,
        assignedUserId,
        status: "PENDING",
        ...schedule,
      },
    });
  }

  for (const target of existing) {
    if (wantedProfileIds.has(target.socialProfileId)) {
      continue;
    }

    if (target.status === "PENDING") {
      await tx.postTarget.delete({ where: { id: target.id } });
    }
  }
}

/**
 * Derives the post status from its targets. Returns the stored status so the
 * caller can branch on it.
 *
 * Phase 2 (master.txt 2.8): a post whose outstanding targets are all still in the
 * future reads as SCHEDULED; as soon as one of them comes due it drops back to
 * MANUAL_PENDING, which is the same status a Phase 1 unscheduled post has. That
 * keeps a single status meaning "somebody still has to publish this by hand"
 * without inventing a fourth manual workflow.
 */
export async function recomputePostStatus(
  postId: string,
  fallback: PostStatus = "MANUAL_PENDING",
): Promise<PostStatus> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, status: true },
  });

  if (!post || post.status === "CANCELLED" || post.status === "DRAFT") {
    return post?.status ?? fallback;
  }

  const targets = await prisma.postTarget.findMany({
    where: { postId },
    select: { status: true, scheduledAt: true },
  });

  if (targets.length === 0) {
    return post.status;
  }

  const now = new Date();
  const effective = targets.map((target) =>
    effectiveTargetStatus(target.status, target.scheduledAt, now),
  );

  const completed = effective.filter((status) => status === "COMPLETED").length;

  // "Started" means somebody actually began publishing it, so only IN_PROGRESS
  // and FAILED qualify. A derived OVERDUE is deliberately excluded: the slot
  // passed without anyone touching it, which means the post still needs a human
  // now - that is MANUAL_PENDING, not IN_PROGRESS.
  const started = effective.filter(
    (status) => status === "IN_PROGRESS" || status === "FAILED",
  ).length;

  // "Still in the future" is read off the instant rather than the status, since
  // no target status means SCHEDULED - only the derived post status does.
  const allStillAhead = targets
    .filter((_target, index) => effective[index] !== "COMPLETED")
    .every((target) => target.scheduledAt !== null && target.scheduledAt.getTime() > now.getTime());

  let next: PostStatus;
  if (completed === effective.length) {
    next = "COMPLETED";
  } else if (started > 0) {
    next = "IN_PROGRESS";
  } else if (allStillAhead) {
    next = "SCHEDULED";
  } else {
    next = "MANUAL_PENDING";
  }

  if (next !== post.status) {
    await prisma.post.update({ where: { id: postId }, data: { status: next } });
  }

  return next;
}

async function assertMember(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!member) {
    throw new Error("The selected assignee is not an active member of this workspace.");
  }
}
