import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  readAt: Date | null;
};

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  entityType: true,
  entityId: true,
  createdAt: true,
  readAt: true,
} as const;

export const listNotifications = cache(async (limit = 20): Promise<NotificationRow[]> => {
  const { workspace, user } = await requireWorkspace();

  return prisma.notification.findMany({
    where: { workspaceId: workspace.id, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: notificationSelect,
  });
});

export const countUnreadNotifications = cache(async (): Promise<number> => {
  const { workspace, user } = await requireWorkspace();

  return prisma.notification.count({
    where: { workspaceId: workspace.id, userId: user.id, readAt: null },
  });
});
