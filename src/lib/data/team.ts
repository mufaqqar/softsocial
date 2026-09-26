import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import type { MemberStatus, WorkspaceRole } from "@/generated/prisma/enums";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  status: MemberStatus;
  createdAt: Date;
  joinedAt: Date | null;
  lastLoginAt: Date | null;
  assignedTargetCount: number;
};

/**
 * Open (not yet completed) targets per user. Counted with a groupBy because
 * `PostTarget.assignedUserId` points at `User`, not at the membership row.
 */
const countOpenTargets = cache(async (workspaceId: string) => {
  const grouped = await prisma.postTarget.groupBy({
    by: ["assignedUserId"],
    where: {
      workspaceId,
      status: { in: ["PENDING", "IN_PROGRESS", "FAILED"] },
      assignedUserId: { not: null },
    },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();

  for (const row of grouped) {
    if (row.assignedUserId) {
      counts.set(row.assignedUserId, row._count._all);
    }
  }

  return counts;
});

export const listMembers = cache(async (): Promise<MemberRow[]> => {
  const { workspace } = await requireWorkspace();

  const [members, openTargets] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        joinedAt: true,
        user: {
          select: { name: true, email: true, avatarUrl: true, lastLoginAt: true },
        },
      },
    }),
    countOpenTargets(workspace.id),
  ]);

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt,
    joinedAt: member.joinedAt,
    lastLoginAt: member.user.lastLoginAt,
    assignedTargetCount: openTargets.get(member.userId) ?? 0,
  }));
});

/** Active members only - used for every assignee dropdown. */
export const listAssignableMembers = cache(async () => {
  const { workspace } = await requireWorkspace();

  return prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, status: "ACTIVE" },
    orderBy: { user: { name: "asc" } },
    select: { id: true, userId: true, role: true, user: { select: { name: true } } },
  });
});

export async function countMembers(workspaceId: string): Promise<number> {
  return prisma.workspaceMember.count({
    where: { workspaceId, status: "ACTIVE" },
  });
}

export async function getMember(memberId: string): Promise<MemberRow | null> {
  const { workspace, permissions } = await requireWorkspace();

  if (!can(permissions, PERMISSIONS.teamRead)) {
    return null;
  }

  const [member, openTargets] = await Promise.all([
    prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: workspace.id },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        joinedAt: true,
        user: {
          select: { name: true, email: true, avatarUrl: true, lastLoginAt: true },
        },
      },
    }),
    countOpenTargets(workspace.id),
  ]);

  if (!member) {
    return null;
  }

  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt,
    joinedAt: member.joinedAt,
    lastLoginAt: member.user.lastLoginAt,
    assignedTargetCount: openTargets.get(member.userId) ?? 0,
  };
}
