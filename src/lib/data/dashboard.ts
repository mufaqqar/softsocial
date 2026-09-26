import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";

export type DashboardStats = {
  totalProfiles: number;
  facebookProfiles: number;
  linkedinProfiles: number;
  totalPosts: number;
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  teamMembers: number;
};

export const getDashboardStats = cache(async (): Promise<DashboardStats> => {
  const { workspace } = await requireWorkspace();

  const [totalProfiles, facebookProfiles, linkedinProfiles, totalPosts, teamMembers] =
    await Promise.all([
      prisma.socialProfile.count({
        where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      }),
      prisma.socialProfile.count({
        where: { workspaceId: workspace.id, platform: "FACEBOOK", status: { not: "ARCHIVED" } },
      }),
      prisma.socialProfile.count({
        where: { workspaceId: workspace.id, platform: "LINKEDIN", status: { not: "ARCHIVED" } },
      }),
      prisma.post.count({ where: { workspaceId: workspace.id } }),
      prisma.workspaceMember.count({
        where: { workspaceId: workspace.id, status: "ACTIVE" },
      }),
    ]);

  const grouped = await prisma.postTarget.groupBy({
    by: ["status"],
    where: { workspaceId: workspace.id },
    _count: { _all: true },
  });

  const countFor = (status: string) =>
    grouped.find((group) => group.status === status)?._count._all ?? 0;

  return {
    totalProfiles,
    facebookProfiles,
    linkedinProfiles,
    totalPosts,
    pendingTasks: countFor("PENDING") + countFor("IN_PROGRESS"),
    completedTasks: countFor("COMPLETED"),
    failedTasks: countFor("FAILED"),
    teamMembers,
  };
});

export type ActivityRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: Date;
  userName: string | null;
};

/** The team activity feed. Members see the workspace feed too (it is not sensitive). */
export const listActivity = cache(
  async (limit = 50, cursor?: string): Promise<{ rows: ActivityRow[]; nextCursor: string | null }> => {
    const { workspace } = await requireWorkspace();

    const rows = await prisma.activityLog.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        summary: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    });

    const hasMore = rows.length > limit;

    return {
      rows: rows.slice(0, limit).map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        summary: row.summary,
        createdAt: row.createdAt,
        userName: row.user?.name ?? null,
      })),
      nextCursor: hasMore ? (rows[limit - 1]?.id ?? null) : null,
    };
  },
);

export type MyActivity = ActivityRow & { userId: string | null };

/** The signed-in user's own activity, used on the dashboard. */
export const listMyActivity = cache(async (limit = 10): Promise<MyActivity[]> => {
  const { workspace, user } = await requireWorkspace();

  const rows = await prisma.activityLog.findMany({
    where: { workspaceId: workspace.id, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      summary: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    createdAt: row.createdAt,
    userId: row.userId,
    userName: row.user?.name ?? null,
  }));
});
