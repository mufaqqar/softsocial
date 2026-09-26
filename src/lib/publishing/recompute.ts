import type { PrismaClient } from "@/generated/prisma/client";
import { derivePostStatus, type TargetSnapshot } from "@/lib/publishing/status";

/**
 * Recomputes `Post.status` from its targets, per master.txt 3.11.
 *
 * The client is a parameter so the app and the worker can share this logic
 * while keeping their own Prisma singletons: `@/lib/db` carries `server-only`
 * and cannot be imported by the worker process.
 *
 * `Post.publishedAt` is stamped when the post first reaches PUBLISHED and left
 * alone afterwards, so the field means "when this post went live" rather than
 * "when the last target finished".
 */
export async function recomputePostStatus(
  db: PrismaClient,
  postId: string,
): Promise<{ status: string; published: number; failed: number; pending: number }> {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      workspaceId: true,
      targets: { select: { status: true, retryCount: true, completedAt: true } },
    },
  });

  if (!post) {
    return { status: "GONE", published: 0, failed: 0, pending: 0 };
  }

  const targets: TargetSnapshot[] = post.targets;
  const derived = derivePostStatus(targets, post.status);

  if (derived.status === post.status) {
    return derived;
  }

  await db.post.update({
    where: { id: post.id },
    data: {
      status: derived.status as never,
      ...(derived.status === "PUBLISHED" && !post.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  return derived;
}
