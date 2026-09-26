import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";

export type MediaRow = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  altText: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
  uploadedByName: string;
  postCount: number;
};

export const listMedia = cache(async (): Promise<MediaRow[]> => {
  const { workspace } = await requireWorkspace();

  const media = await prisma.media.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      altText: true,
      width: true,
      height: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
      _count: { select: { posts: true } },
    },
  });

  return media.map((item) => ({
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    size: item.size,
    altText: item.altText,
    width: item.width,
    height: item.height,
    createdAt: item.createdAt,
    uploadedByName: item.uploadedBy.name,
    postCount: item._count.posts,
  }));
});

export async function getMedia(id: string) {
  const { workspace } = await requireWorkspace();

  return prisma.media.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true, storageKey: true, filename: true, mimeType: true },
  });
}

/** Media in this workspace not yet attached to any post - the attach picker. */
export const listUnattachedMedia = cache(async (): Promise<MediaRow[]> => {
  const { workspace } = await requireWorkspace();

  const media = await prisma.media.findMany({
    where: { workspaceId: workspace.id, posts: { none: {} } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      altText: true,
      width: true,
      height: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
      _count: { select: { posts: true } },
    },
  });

  return media.map((item) => ({
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    size: item.size,
    altText: item.altText,
    width: item.width,
    height: item.height,
    createdAt: item.createdAt,
    uploadedByName: item.uploadedBy.name,
    postCount: item._count.posts,
  }));
});
