import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { deletePostAction } from "@/actions/posts";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/stat-card";
import { CommentThread } from "@/components/posts/comment-thread";
import { PlatformBadge, PostStatusBadge, TargetStatusBadge } from "@/components/status-badges";
import { TargetActions } from "@/components/tasks/target-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { getPost } from "@/lib/data/posts";
import { listAssignableMembers } from "@/lib/data/team";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { dateKeyOf, timeKeyOf } from "@/lib/scheduling";
import { ScheduleDialog } from "@/components/calendar/schedule-dialog";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/posts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);

  return { title: post?.title || "Post" };
}

export default async function PostDetailPage({ params }: PageProps<"/dashboard/posts/[id]">) {
  const { id } = await params;
  const context = await requireWorkspace();
  const post = await getPost(id);

  if (!post) {
    notFound();
  }

  const canManage = can(context.permissions, PERMISSIONS.postManage);
  const canManageAny = can(context.permissions, PERMISSIONS.targetUpdateAny);
  const canComment = can(context.permissions, PERMISSIONS.postComment);
  const done = post.completedTargets;
  const total = post.totalTargets;
  const timeZone = context.workspace.timezone;
  const assignees = canManageAny
    ? (await listAssignableMembers()).map((member) => ({
        userId: member.userId,
        name: member.user.name,
      }))
    : [];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/posts">
          <ArrowLeft />
          All posts
        </Link>
      </Button>

      <PageHeader
        title={post.title || "Untitled post"}
        description={`Created by ${post.createdByName} on ${formatDate(post.createdAt)}`}
        icon={FileText}
        actions={
          <>
            <PostStatusBadge status={post.status} />
            {canManage ? (
              <form action={deletePostAction}>
                <input type="hidden" name="postId" value={post.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                >
                  Delete
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="Copy"
            description="Copy the text, publish it on the platform by hand, then mark the target complete."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Default copy
                </p>
                <div className="bg-muted/40 flex items-start gap-3 rounded-md border p-4">
                  <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap">
                    {post.content || "No default copy."}
                  </p>
                  {post.content ? <CopyButton value={post.content} label="Copy" /> : null}
                </div>
              </div>

              {post.variants.map((variant) => (
                <div key={variant.platform} className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {PLATFORM_LABELS[variant.platform]}
                  </p>
                  <div className="bg-muted/40 flex items-start gap-3 rounded-md border p-4">
                    <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap">
                      {variant.text || "Falls back to the default copy."}
                    </p>
                    {variant.text ? <CopyButton value={variant.text} label="Copy" /> : null}
                  </div>
                </div>
              ))}

              {post.hashtags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Hashtags</span>
                  {post.hashtags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {post.notes ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Internal notes
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{post.notes}</p>
                </div>
              ) : null}
            </div>
          </SectionCard>

          {post.media.length > 0 ? (
            <SectionCard title="Media">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {post.media.map((item) => (
                  <li key={item.id} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/media/${item.mediaId}`}
                      alt={item.altText ?? item.filename}
                      className="aspect-square w-full rounded-md border object-cover"
                    />
                    <p className="text-muted-foreground truncate text-xs">{item.filename}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <SectionCard title="Comments">
            <CommentThread
              postId={post.id}
              comments={post.comments}
              canComment={canComment}
            />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Targets"
            description={`${done} of ${total} completed`}
            contentClassName="space-y-3 p-4"
          >
            {post.targets.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No targets yet. Edit the post to choose profiles.
              </p>
            ) : (
              post.targets.map((target) => {
                const canAct =
                  canManageAny || target.assignedUserId === context.user.id;

                return (
                  <div key={target.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformBadge platform={target.platform} />
                      <TargetStatusBadge status={target.status} />
                      {target.profileUrl ? (
                        <a
                          href={target.profileUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary truncate text-sm underline underline-offset-4"
                        >
                          {target.profileName}
                        </a>
                      ) : (
                        <span className="truncate text-sm font-medium">{target.profileName}</span>
                      )}

                      {canAct && target.status !== "CANCELLED" ? (
                        <div className="ml-auto flex items-center gap-2">
                          <ScheduleDialog
                            targetId={target.id}
                            profileName={target.profileName}
                            initialDate={
                              target.scheduledAt
                                ? dateKeyOf(target.scheduledAt, target.timezone ?? timeZone)
                                : null
                            }
                            initialTime={
                              target.scheduledAt
                                ? timeKeyOf(target.scheduledAt, target.timezone ?? timeZone)
                                : null
                            }
                            initialTimeZone={target.timezone}
                            initialAssigneeId={target.assignedUserId}
                            initialReminderLeadMinutes={
                              target.scheduledAt && target.reminderAt
                                ? Math.round(
                                    (target.scheduledAt.getTime() - target.reminderAt.getTime()) /
                                      60_000,
                                  )
                                : 0
                            }
                            assignees={assignees}
                            workspaceTimeZone={timeZone}
                            trigger={
                              <Badge variant={target.scheduledAt ? "secondary" : "outline"}>
                                {target.scheduledAt ? "Reschedule" : "Schedule"}
                              </Badge>
                            }
                          />
                        </div>
                      ) : null}
                    </div>

                    <p className="text-muted-foreground text-xs">
                      {target.scheduledAt
                        ? `${dateKeyOf(target.scheduledAt, target.timezone ?? timeZone)} at ${timeKeyOf(
                            target.scheduledAt,
                            target.timezone ?? timeZone,
                          )} (${target.timezone ?? timeZone})`
                        : "Not scheduled"}
                    </p>

                    <p className="text-muted-foreground text-xs">
                      {target.assignedUserName
                        ? `Assigned to ${target.assignedUserName}`
                        : "Unassigned"}
                      {target.completedAt
                        ? ` · completed ${formatDateTime(target.completedAt)}`
                        : ""}
                      {target.completedByName ? ` by ${target.completedByName}` : ""}
                    </p>

                    {canAct && target.status !== "CANCELLED" ? (
                      <TargetActions
                        targetId={target.id}
                        status={target.status}
                        notes={target.notes}
                        canManageAny={canManageAny}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </SectionCard>

          <SectionCard title="Details">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Last updated</dt>
                <dd>{formatDateTime(post.updatedAt)}</dd>
              </div>
              {post.assignedUserName ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Default assignee</dt>
                  <dd>{post.assignedUserName}</dd>
                </div>
              ) : null}
              {canManage ? (
                <div className="pt-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/posts/${post.id}/edit`}>Edit post</Link>
                  </Button>
                </div>
              ) : null}
            </dl>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
