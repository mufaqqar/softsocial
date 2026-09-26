"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/activity";
import { formError, type FormState } from "@/lib/form-state";
import {
  socialProfileSchema,
  type SocialProfileInput,
} from "@/lib/validation/social-profile";

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string[] | undefined> {
  const fieldErrors: Record<string, string[] | undefined> = {};

  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }

  return fieldErrors;
}

export async function createSocialProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.profileManage);
  } catch (error) {
    return formError(error);
  }

  const parsed = socialProfileSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const input: SocialProfileInput = parsed.data;

  try {
    await assertAssigneeInWorkspace(context.workspace.id, input.assignedUserId);

    const profile = await prisma.socialProfile.create({
      data: {
        workspaceId: context.workspace.id,
        platform: input.platform,
        name: input.name,
        profileUrl: input.profileUrl,
        username: input.username,
        avatarUrl: input.avatarUrl,
        description: input.description,
        notes: input.notes,
        status: input.status,
        assignedUserId: input.assignedUserId,
      },
      select: { id: true },
    });

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "SOCIAL_PROFILE_CREATED",
      entityType: "SOCIAL_PROFILE",
      entityId: profile.id,
      summary: `${context.user.name} added ${input.platform === "FACEBOOK" ? "Facebook" : "LinkedIn"} profile "${input.name}"`,
    });

    revalidatePath("/dashboard/social-profiles");
    return { ok: true, message: `"${input.name}" added.` };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: `A ${input.platform === "FACEBOOK" ? "Facebook" : "LinkedIn"} profile named "${input.name}" already exists in this workspace.`,
      };
    }

    return formError(error);
  }
}

export async function updateSocialProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.profileManage);
  } catch (error) {
    return formError(error);
  }

  const profileId = String(formData.get("profileId") ?? "");
  const parsed = socialProfileSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const input: SocialProfileInput = parsed.data;

  const existing = await prisma.socialProfile.findFirst({
    where: { id: profileId, workspaceId: context.workspace.id },
    select: { id: true, name: true, platform: true },
  });

  if (!existing) {
    return { error: "That profile is not part of this workspace." };
  }

  try {
    await assertAssigneeInWorkspace(context.workspace.id, input.assignedUserId);

    await prisma.socialProfile.update({
      where: { id: existing.id },
      data: {
        platform: input.platform,
        name: input.name,
        profileUrl: input.profileUrl,
        username: input.username,
        avatarUrl: input.avatarUrl,
        description: input.description,
        notes: input.notes,
        status: input.status,
        assignedUserId: input.assignedUserId,
      },
    });

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "SOCIAL_PROFILE_UPDATED",
      entityType: "SOCIAL_PROFILE",
      entityId: existing.id,
      summary: `${context.user.name} updated "${input.name}"`,
    });

    revalidatePath("/dashboard/social-profiles");
    return { ok: true, message: `"${input.name}" updated.` };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: `A profile named "${input.name}" already exists on that platform.`,
      };
    }

    return formError(error);
  }
}

export async function removeSocialProfileAction(formData: FormData): Promise<void> {
  const context = await assertPermission(PERMISSIONS.profileManage);
  const profileId = String(formData.get("profileId") ?? "");

  const profile = await prisma.socialProfile.findFirst({
    where: { id: profileId, workspaceId: context.workspace.id },
    select: { id: true, name: true, _count: { select: { postTargets: true } } },
  });

  if (!profile) {
    return;
  }

  // Profiles referenced by posts are archived so history is never lost.
  if (profile._count.postTargets > 0) {
    await prisma.socialProfile.update({
      where: { id: profile.id },
      data: { status: "ARCHIVED" },
    });

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "SOCIAL_PROFILE_REMOVED",
      entityType: "SOCIAL_PROFILE",
      entityId: profile.id,
      summary: `${context.user.name} archived "${profile.name}" (used by ${profile._count.postTargets} post target(s))`,
    });
  } else {
    await prisma.socialProfile.delete({ where: { id: profile.id } });

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "SOCIAL_PROFILE_REMOVED",
      entityType: "SOCIAL_PROFILE",
      entityId: profile.id,
      summary: `${context.user.name} removed "${profile.name}"`,
    });
  }

  revalidatePath("/dashboard/social-profiles");
}

async function assertAssigneeInWorkspace(
  workspaceId: string,
  assignedUserId: string | null,
): Promise<void> {
  if (!assignedUserId) {
    return;
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: assignedUserId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!member) {
    throw new Error("The assigned member is not an active member of this workspace.");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
