import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import type { ConnectionStatus, SocialPlatform } from "@/generated/prisma/enums";
import type { SocialProfileFilter } from "@/lib/validation/social-profile";

export type SocialProfileRow = {
  id: string;
  platform: SocialPlatform;
  name: string;
  username: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  description: string | null;
  notes: string | null;
  status: ConnectionStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** True once Phase 3 links this manual record to a real Page. */
  linked: boolean;
  postCount: number;
};

const profileSelect = {
  id: true,
  platform: true,
  name: true,
  username: true,
  profileUrl: true,
  avatarUrl: true,
  description: true,
  notes: true,
  status: true,
  assignedUserId: true,
  createdAt: true,
  updatedAt: true,
  providerProfileId: true,
  socialConnectionId: true,
  assignedUser: { select: { name: true } },
  _count: { select: { postTargets: true } },
} as const;

function toRow(profile: {
  id: string;
  platform: SocialPlatform;
  name: string;
  username: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  description: string | null;
  notes: string | null;
  status: ConnectionStatus;
  assignedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  providerProfileId: string | null;
  socialConnectionId: string | null;
  assignedUser: { name: string } | null;
  _count: { postTargets: number };
}): SocialProfileRow {
  return {
    id: profile.id,
    platform: profile.platform,
    name: profile.name,
    username: profile.username,
    profileUrl: profile.profileUrl,
    avatarUrl: profile.avatarUrl,
    description: profile.description,
    notes: profile.notes,
    status: profile.status,
    assignedUserId: profile.assignedUserId,
    assignedUserName: profile.assignedUser?.name ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    linked: Boolean(profile.providerProfileId && profile.socialConnectionId),
    postCount: profile._count.postTargets,
  };
}

export const listSocialProfiles = cache(
  async (filter: SocialProfileFilter = {}): Promise<SocialProfileRow[]> => {
    const { workspace } = await requireWorkspace();

    const profiles = await prisma.socialProfile.findMany({
      where: {
        workspaceId: workspace.id,
        ...(filter.platform ? { platform: filter.platform } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.assignedUserId
          ? { assignedUserId: filter.assignedUserId }
          : {}),
        ...(filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: "insensitive" as const } },
                { username: { contains: filter.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ platform: "asc" }, { name: "asc" }],
      select: profileSelect,
    });

    return profiles.map(toRow);
  },
);

/** Flat list used by the post editor's target picker. */
export const listSelectableProfiles = cache(
  async (): Promise<
    Pick<SocialProfileRow, "id" | "platform" | "name" | "username" | "status">[]
  > => {
    const { workspace } = await requireWorkspace();

    const profiles = await prisma.socialProfile.findMany({
      where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      orderBy: [{ platform: "asc" }, { name: "asc" }],
      select: {
        id: true,
        platform: true,
        name: true,
        username: true,
        status: true,
      },
    });

    return profiles;
  },
);

export async function getSocialProfile(
  id: string,
): Promise<SocialProfileRow | null> {
  const { workspace } = await requireWorkspace();

  const profile = await prisma.socialProfile.findFirst({
    where: { id, workspaceId: workspace.id },
    select: profileSelect,
  });

  return profile ? toRow(profile) : null;
}

export async function countSocialProfiles(workspaceId: string): Promise<number> {
  return prisma.socialProfile.count({
    where: { workspaceId, status: { not: "ARCHIVED" } },
  });
}
