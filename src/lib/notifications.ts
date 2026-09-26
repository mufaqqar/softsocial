import "server-only";

import type { NotificationType } from "@/generated/prisma/enums";

import { prisma } from "@/lib/db";

type NotificationInput = {
  workspaceId: string;
  userIds: readonly string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

/** Fan-out helper. Duplicated ids are collapsed; failures are logged only. */
export async function notifyUsers(input: NotificationInput): Promise<void> {
  const userIds = [...new Set(input.userIds)].filter(Boolean);

  if (userIds.length === 0) {
    return;
  }

  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        workspaceId: input.workspaceId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    });
  } catch (error) {
    console.error("Failed to create notifications", error);
  }
}

/** Everyone in the workspace who holds a role, used to route work. */
export async function userIdsWithRole(
  workspaceId: string,
  roles: readonly ("OWNER" | "ADMIN" | "MEMBER")[],
): Promise<string[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: { in: [...roles] }, status: "ACTIVE" },
    select: { userId: true },
  });

  return members.map((member) => member.userId);
}
