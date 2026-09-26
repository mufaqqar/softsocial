import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/page-header";
import { PlatformBadge, PostStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { listPosts } from "@/lib/data/posts";
import { PHASE1_POST_STATUSES, POST_STATUS_LABELS } from "@/lib/constants";
import { formatDate, truncate } from "@/lib/format";
import { postFilterSchema } from "@/lib/validation/post";

export const metadata: Metadata = {
  title: "Posts",
};

export default async function PostsPage({ searchParams }: PageProps<"/dashboard/posts">) {
  const context = await requireWorkspace();
  const params = await searchParams;

  const filter = postFilterSchema.parse({
    status: typeof params.status === "string" ? params.status : undefined,
    q: typeof params.q === "string" ? params.q : undefined,
  });

  const posts = await listPosts(filter);
  const canCreate = can(context.permissions, PERMISSIONS.postManage);

  return (
    <>
      <PageHeader
        title="Posts"
        description="Every post in this workspace and how far its manual publishing has progressed."
        icon={FileText}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/dashboard/posts/new">
                <Plus />
                New post
              </Link>
            </Button>
          ) : null
        }
      />

      <form className="flex flex-wrap gap-2" action="/dashboard/posts">
        <Input
          name="q"
          defaultValue={filter.q ?? ""}
          placeholder="Search title or content"
          className="max-w-xs"
        />
        <select
          name="status"
          defaultValue={filter.status ?? ""}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">All statuses</option>
          {PHASE1_POST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {POST_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No posts yet"
          description={
            filter.status || filter.q
              ? "Nothing matches this filter."
              : "Create a post, pick the profiles it should go to, and assign it to your team."
          }
          action={
            canCreate && !filter.status && !filter.q
              ? { label: "Create the first post", href: "/dashboard/posts/new" }
              : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.id}>
              <Card>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <PostStatusBadge status={post.status} />
                    {post.platforms.map((platform) => (
                      <PlatformBadge key={platform} platform={platform} />
                    ))}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {formatDate(post.createdAt)}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Link
                      href={`/dashboard/posts/${post.id}`}
                      className="font-medium hover:underline"
                    >
                      {post.title || truncate(post.excerpt, 70) || "Untitled post"}
                    </Link>
                    {post.excerpt ? (
                      <p className="text-muted-foreground line-clamp-2 text-sm">{post.excerpt}</p>
                    ) : null}
                  </div>

                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>
                      {post.completedTargets}/{post.totalTargets} targets completed
                    </span>
                    <span>Created by {post.createdByName}</span>
                    {post.assignedUserName ? (
                      <span>Assigned to {post.assignedUserName}</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
