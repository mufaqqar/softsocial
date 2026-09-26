"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import {
  assertPermission,
  requireSession,
  requireWorkspace,
  setActiveWorkspace,
} from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/activity";
import { formError, type FormState } from "@/lib/form-state";
import { slugify } from "@/lib/slug";
import { updateWorkspaceSchema } from "@/lib/validation/team";

export async function updateWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.workspaceManage);
  } catch (error) {
    return formError(error);
  }

  const parsed = updateWorkspaceSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const input = parsed.data;

  try {
    await prisma.$transaction([
      prisma.workspace.update({
        where: { id: context.workspace.id },
        data: { name: input.name, timezone: input.timezone },
      }),
      prisma.workspaceSetting.updateMany({
        where: { workspaceId: context.workspace.id },
        data: { defaultTimezone: input.timezone },
      }),
    ]);

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "WORKSPACE_UPDATED",
      entityType: "WORKSPACE",
      entityId: context.workspace.id,
      summary: `${context.user.name} updated the workspace settings`,
    });

    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Workspace updated." };
  } catch (error) {
    return formError(error);
  }
}

/** Points the workspace cookie at another workspace the user belongs to. */
export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const workspaceId = String(formData.get("workspaceId") ?? "");

  const allowed = session.workspaces.some((workspace) => workspace.id === workspaceId);

  if (!allowed) {
    return;
  }

  await setActiveWorkspace(workspaceId);
  revalidatePath("/dashboard", "layout");
}

/** Not used in Phase 1 but keeps the slug column honest for future features. */
export async function previewSlugAction(formData: FormData): Promise<{ slug: string }> {
  await requireWorkspace();

  const name = String(formData.get("name") ?? "");
  return { slug: slugify(name) };
}

export async function markNotificationsReadAction(formData: FormData): Promise<void> {
  const context = await requireWorkspace();
  const notificationId = String(formData.get("notificationId") ?? "");

  if (notificationId) {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        workspaceId: context.workspace.id,
        userId: context.user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  } else {
    await prisma.notification.updateMany({
      where: {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  revalidatePath("/dashboard", "layout");
}
