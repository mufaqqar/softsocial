"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { assertPermission } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/activity";
import { notifyUsers } from "@/lib/notifications";
import { formError, type FormState } from "@/lib/form-state";
import {
  addMemberSchema,
  updateMemberSchema,
  type AddMemberInput,
  type UpdateMemberInput,
} from "@/lib/validation/team";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation/auth";

/**
 * Adds a team member. If the email already has an account the person is simply
 * given a membership; otherwise an account is created with the temporary
 * password supplied by the admin.
 */
export async function addMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.teamManage);
  } catch (error) {
    return formError(error);
  }

  const parsed = addMemberSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const input: AddMemberInput = parsed.data;

  if (input.role === "OWNER") {
    return { error: "Ownership is transferred in workspace settings." };
  }

  try {
    let userId: string;
    let createdAccount = false;

    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true },
    });

    if (existing) {
      userId = existing.id;
    } else {
      const passwordCheck = passwordSchema.safeParse(input.password);

      if (!passwordCheck.success) {
        return {
          fieldErrors: {
            password:
              input.password === undefined || input.password === ""
                ? ["A temporary password is required for a new member."]
                : passwordCheck.error.issues.map((issue) => issue.message),
          },
        };
      }

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(passwordCheck.data),
        },
        select: { id: true },
      });

      userId = user.id;
      createdAccount = true;
    }

    await prisma.workspaceMember.create({
      data: {
        workspaceId: context.workspace.id,
        userId,
        role: input.role,
        status: "ACTIVE",
        joinedAt: new Date(),
        invitedById: context.user.id,
      },
    });

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "MEMBER_INVITED",
      entityType: "USER",
      entityId: userId,
      summary: `${context.user.name} added ${input.name} as ${input.role.toLowerCase()}`,
      metadata: { role: input.role, createdAccount },
      ipAddress: (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim(),
    });

    await notifyUsers({
      workspaceId: context.workspace.id,
      userIds: [userId],
      type: "WORKSPACE_INVITATION",
      title: `You were added to ${context.workspace.name}`,
      body: `You now have ${input.role.toLowerCase()} access. Sign in to see your tasks.`,
      entityType: "WORKSPACE",
      entityId: context.workspace.id,
    });

    revalidatePath("/dashboard/team");
    return {
      ok: true,
      message: createdAccount
        ? `${input.name} can now sign in with the temporary password you set.`
        : `${input.name} already had an account and was added to the workspace.`,
      fieldErrors: { name: undefined, email: undefined, role: undefined, password: undefined },
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { error: "That email is already a member of this workspace." };
    }

    return formError(error);
  }
}

export async function updateMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.teamManage);
  } catch (error) {
    return formError(error);
  }

  const parsed = updateMemberSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const input: UpdateMemberInput = parsed.data;

  const member = await prisma.workspaceMember.findFirst({
    where: { id: input.memberId, workspaceId: context.workspace.id },
    select: { id: true, role: true, status: true, userId: true, user: { select: { name: true } } },
  });

  if (!member) {
    return { error: "That member is not part of this workspace." };
  }

  if (member.role === "OWNER") {
    const owners = await prisma.workspaceMember.count({
      where: { workspaceId: context.workspace.id, role: "OWNER", status: "ACTIVE" },
    });

    if (owners <= 1) {
      return { error: "The workspace must keep at least one active owner." };
    }

    if (input.role !== "OWNER" || input.status !== "ACTIVE") {
      return { error: "Transfer ownership before changing this owner." };
    }
  }

  if (member.userId === context.user.id && input.role !== member.role) {
    return { error: "You cannot change your own role." };
  }

  try {
    await prisma.workspaceMember.update({
      where: { id: member.id },
      data: { role: input.role, status: input.status },
    });

    await prisma.user.update({
      where: { id: member.userId },
      data: { name: input.name },
    });

    if (input.name !== member.user.name) {
      await recordActivity({
        workspaceId: context.workspace.id,
        userId: context.user.id,
        action: "MEMBER_STATUS_CHANGED",
        entityType: "USER",
        entityId: member.userId,
        summary: `${context.user.name} updated ${input.name}'s profile`,
      });
    }

    if (input.role !== member.role) {
      await recordActivity({
        workspaceId: context.workspace.id,
        userId: context.user.id,
        action: "MEMBER_ROLE_CHANGED",
        entityType: "USER",
        entityId: member.userId,
        summary: `${context.user.name} changed ${input.name}'s role from ${member.role} to ${input.role}`,
        metadata: { from: member.role, to: input.role },
      });
    }

    if (input.status !== member.status) {
      await recordActivity({
        workspaceId: context.workspace.id,
        userId: context.user.id,
        action: "MEMBER_STATUS_CHANGED",
        entityType: "USER",
        entityId: member.userId,
        summary: `${context.user.name} set ${input.name}'s status to ${input.status.toLowerCase()}`,
        metadata: { from: member.status, to: input.status },
      });
    }

    revalidatePath("/dashboard/team");
    return { ok: true, message: `${input.name} updated.` };
  } catch (error) {
    return formError(error);
  }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const context = await assertPermission(PERMISSIONS.teamManage);
  const memberId = String(formData.get("memberId") ?? "");

  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: context.workspace.id },
    select: { id: true, role: true, userId: true, user: { select: { name: true } } },
  });

  if (!member) {
    return;
  }

  if (member.role === "OWNER") {
    throw new Error("The workspace owner cannot be removed.");
  }

  if (member.userId === context.user.id) {
    throw new Error("You cannot remove yourself from the workspace.");
  }

  // Soft-remove: posts, history and notes stay intact, but the work stops being
  // assigned to someone who can no longer see it. Completed targets keep their
  // completion record; only open work is released.
  await prisma.$transaction([
    prisma.workspaceMember.update({
      where: { id: member.id },
      data: { status: "REMOVED" },
    }),
    prisma.postTarget.updateMany({
      where: {
        workspaceId: context.workspace.id,
        assignedUserId: member.userId,
        status: { not: "COMPLETED" },
      },
      data: { assignedUserId: null },
    }),
    prisma.post.updateMany({
      where: { workspaceId: context.workspace.id, assignedUserId: member.userId },
      data: { assignedUserId: null },
    }),
    prisma.socialProfile.updateMany({
      where: { workspaceId: context.workspace.id, assignedUserId: member.userId },
      data: { assignedUserId: null },
    }),
  ]);

  await recordActivity({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    action: "MEMBER_REMOVED",
    entityType: "USER",
    entityId: member.userId,
    summary: `${context.user.name} removed ${member.user.name} from the workspace`,
  });

  revalidatePath("/dashboard/team");
}

export async function changeOwnPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { requireSession } = await import("@/lib/auth/dal");
  const session = await requireSession();

  const currentCheck = String(formData.get("currentPassword") ?? "");
  const nextCheck = passwordSchema.safeParse(formData.get("newPassword"));

  if (!nextCheck.success) {
    return {
      fieldErrors: {
        newPassword: nextCheck.error.issues.map((issue) => issue.message),
      },
    };
  }

  if (currentCheck.length === 0) {
    return { fieldErrors: { currentPassword: ["Current password is required."] } };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  const { verifyPassword } = await import("@/lib/auth/password");

  if (!(await verifyPassword(currentCheck, user?.passwordHash))) {
    return { fieldErrors: { currentPassword: ["That password is not correct."] } };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await hashPassword(nextCheck.data) },
  });

  return { ok: true, message: "Password updated." };
}

export async function updateOwnProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { requireSession } = await import("@/lib/auth/dal");
  const session = await requireSession();

  const nameCheck = nameSchema.safeParse(formData.get("name"));
  const emailCheck = emailSchema.safeParse(formData.get("email"));

  const fieldErrors: Record<string, string[] | undefined> = {};

  if (!nameCheck.success) {
    fieldErrors.name = nameCheck.error.issues.map((issue) => issue.message);
  }

  if (!emailCheck.success) {
    fieldErrors.email = emailCheck.error.issues.map((issue) => issue.message);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const clash = await prisma.user.findFirst({
    where: { email: emailCheck.data, NOT: { id: session.user.id } },
    select: { id: true },
  });

  if (clash) {
    return { fieldErrors: { email: ["That email is already in use."] } };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: nameCheck.data, email: emailCheck.data },
  });

  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Profile updated." };
}
