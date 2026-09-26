import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import type {
  PostStatus,
  PostTargetStatus,
  SocialPlatform,
  WorkspaceRole,
} from "@/generated/prisma/enums";
import type { PostFilter } from "@/lib/validation/post";

export type PostRow = {
  id: string;
  title: string | null;
  status: PostStatus;
  excerpt: string;
  platforms: SocialPlatform[];
  totalTargets: number;
  completedTargets: number;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TargetRow = {
  id: string;
  socialProfileId: string;
  platform: SocialPlatform;
  profileName: string;
  profileUrl: string | null;
  username: string | null;
  avatarUrl: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  status: PostTargetStatus;
  notes: string | null;
  completedAt: Date | null;
  completedByName: string | null;
  /**
   * Phase 2 scheduling fields. `timezone` is stored alongside `scheduledAt`
   * because an instant on its own cannot say which day the author meant.
   */
  scheduledAt: Date | null;
  timezone: string | null;
  reminderAt: Date | null;
  updatedAt: Date;
};

export type PostMediaRow = {
  id: string;
  mediaId: string;
  filename: string;
  mimeType: string;
  size: number;
  altText: string | null;
};

export type PostCommentRow = {
  id: string;
  content: string;
  createdAt: Date;
  authorName: string;
  authorId: string;
};

export type PostDetail = {
  id: string;
  title: string | null;
  content: string;
  hashtags: string[];
  notes: string | null;
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  viewerRole: WorkspaceRole;
  variants: { platform: SocialPlatform; text: string }[];
  targets: TargetRow[];
  media: PostMediaRow[];
  comments: PostCommentRow[];
  totalTargets: number;
  completedTargets: number;
};

function excerpt(text: string, length = 120) {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

const postListSelect = {
  id: true,
  title: true,
  content: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assignedUserId: true,
  assignedTo: { select: { name: true } },
  createdBy: { select: { name: true } },
  targets: {
    select: { status: true, socialProfile: { select: { platform: true } } },
  },
} as const;

export const listPosts = cache(
  async (filter: PostFilter = {}): Promise<PostRow[]> => {
    const { workspace } = await requireWorkspace();

    const posts = await prisma.post.findMany({
      where: {
        workspaceId: workspace.id,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.assignedUserId
          ? {
              OR: [
                { assignedUserId: filter.assignedUserId },
                { targets: { some: { assignedUserId: filter.assignedUserId } } },
              ],
            }
          : {}),
        ...(filter.q
          ? {
              OR: [
                { title: { contains: filter.q, mode: "insensitive" as const } },
                { content: { contains: filter.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: postListSelect,
    });

    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      status: post.status,
      excerpt: excerpt(post.content),
      platforms: [
        ...new Set(post.targets.map((target) => target.socialProfile.platform)),
      ],
      totalTargets: post.targets.length,
      completedTargets: post.targets.filter((target) => target.status === "COMPLETED")
        .length,
      assignedUserId: post.assignedUserId,
      assignedUserName: post.assignedTo?.name ?? null,
      createdByName: post.createdBy.name,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }));
  },
);

export async function getPost(id: string): Promise<PostDetail | null> {
  const { workspace } = await requireWorkspace();

  const post = await prisma.post.findFirst({
    where: { id, workspaceId: workspace.id },
    select: {
      id: true,
      title: true,
      content: true,
      hashtags: true,
      notes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      assignedUserId: true,
      assignedTo: { select: { name: true } },
      createdBy: { select: { name: true } },
      variants: { select: { platform: true, text: true }, orderBy: { platform: "asc" } },
      media: {
        select: {
          id: true,
          position: true,
          media: {
            select: {
              id: true,
              filename: true,
              mimeType: true,
              size: true,
              altText: true,
            },
          },
        },
        orderBy: { position: "asc" },
      },
      targets: {
        select: {
          id: true,
          socialProfileId: true,
          assignedUserId: true,
          status: true,
          notes: true,
          completedAt: true,
          scheduledAt: true,
          timezone: true,
          reminderAt: true,
          updatedAt: true,
          assignedUser: { select: { name: true } },
          completedBy: { select: { name: true } },
          socialProfile: {
            select: {
              platform: true,
              name: true,
              profileUrl: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ socialProfile: { platform: "asc" } }, { createdAt: "asc" }],
      },
      comments: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!post) {
    return null;
  }

  const targets: TargetRow[] = post.targets.map((target) => ({
    id: target.id,
    socialProfileId: target.socialProfileId,
    platform: target.socialProfile.platform,
    profileName: target.socialProfile.name,
    profileUrl: target.socialProfile.profileUrl,
    username: target.socialProfile.username,
    avatarUrl: target.socialProfile.avatarUrl,
    assignedUserId: target.assignedUserId,
    assignedUserName: target.assignedUser?.name ?? null,
    status: target.status,
    notes: target.notes,
    completedAt: target.completedAt,
    completedByName: target.completedBy?.name ?? null,
    scheduledAt: target.scheduledAt,
    timezone: target.timezone,
    reminderAt: target.reminderAt,
    updatedAt: target.updatedAt,
  }));

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    hashtags: post.hashtags,
    notes: post.notes,
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    createdByName: post.createdBy.name,
    assignedUserId: post.assignedUserId,
    assignedUserName: post.assignedTo?.name ?? null,
    viewerRole: workspace.role,
    variants: post.variants,
    targets,
    media: post.media.map((link) => ({
      id: link.media.id,
      mediaId: link.media.id,
      filename: link.media.filename,
      mimeType: link.media.mimeType,
      size: link.media.size,
      altText: link.media.altText,
    })),
    comments: post.comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      authorId: comment.user.id,
      authorName: comment.user.name,
    })),
    totalTargets: targets.length,
    completedTargets: targets.filter((target) => target.status === "COMPLETED").length,
  };
}

/**
 * Targets the signed-in user is responsible for, newest post first. Phase 1
 * shows these on the dashboard and the My Tasks page.
 */
export const listMyTasks = cache(async () => {
  const { workspace, user } = await requireWorkspace();

  const targets = await prisma.postTarget.findMany({
    where: {
      workspaceId: workspace.id,
      assignedUserId: user.id,
      status: { in: ["PENDING", "IN_PROGRESS", "FAILED"] },
    },
    orderBy: { post: { createdAt: "desc" } },
    select: {
      id: true,
      status: true,
      notes: true,
      post: {
        select: {
          id: true,
          title: true,
          status: true,
          content: true,
          createdAt: true,
          variants: { select: { platform: true, text: true } },
        },
      },
      socialProfile: {
        select: { platform: true, name: true, profileUrl: true },
      },
    },
  });

  return targets;
});

export type MyTaskRow = {
  targetId: string;
  postId: string;
  postTitle: string | null;
  postStatus: PostStatus;
  postContent: string;
  variants: { platform: SocialPlatform; text: string }[];
  platform: SocialPlatform;
  profileName: string;
  profileUrl: string | null;
  targetStatus: PostTargetStatus;
  notes: string | null;
  postCreatedAt: Date;
};

export async function listMyTaskRows(): Promise<MyTaskRow[]> {
  const targets = await listMyTasks();

  return targets.map((target) => ({
    targetId: target.id,
    postId: target.post.id,
    postTitle: target.post.title,
    postStatus: target.post.status,
    postContent: target.post.content,
    variants: target.post.variants,
    platform: target.socialProfile.platform,
    profileName: target.socialProfile.name,
    profileUrl: target.socialProfile.profileUrl,
    targetStatus: target.status,
    notes: target.notes,
    postCreatedAt: target.post.createdAt,
  }));
}
