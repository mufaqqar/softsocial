import type { Metadata } from "next";
import Link from "next/link";
import { CheckSquare } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { PageHeader, EmptyState } from "@/components/page-header";
import { PlatformBadge, TargetStatusBadge } from "@/components/status-badges";
import { TargetActions } from "@/components/tasks/target-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { listMyTaskRows } from "@/lib/data/posts";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "My Tasks",
};

export default async function MyTasksPage() {
  const context = await requireWorkspace();
  const tasks = await listMyTaskRows();
  const canManageAny = can(context.permissions, PERMISSIONS.targetUpdateAny);

  return (
    <>
      <PageHeader
        title="My Tasks"
        description="Everything assigned to you. Copy the text, publish it on the platform by hand, then mark it complete."
        icon={CheckSquare}
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No open tasks"
          description="When an owner or admin assigns you a post, it will appear here."
          action={{ label: "Browse posts", href: "/dashboard/posts" }}
        />
      ) : (
        <ul className="space-y-4">
          {tasks.map((task) => {
            const platformLabel = PLATFORM_LABELS[task.platform];
            const text =
              task.variants.find((variant) => variant.platform === task.platform)?.text ||
              task.postContent ||
              task.postTitle ||
              "";

            return (
              <li key={task.targetId}>
                <Card>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformBadge platform={task.platform} />
                      <TargetStatusBadge status={task.targetStatus} />
                      {task.profileUrl ? (
                        <a
                          href={task.profileUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary text-sm underline underline-offset-4"
                        >
                          {task.profileName}
                        </a>
                      ) : (
                        <span className="text-sm font-medium">{task.profileName}</span>
                      )}
                      <span className="text-muted-foreground text-xs">
                        {platformLabel} · created {formatDate(task.postCreatedAt)}
                      </span>
                      <Link
                        href={`/dashboard/posts/${task.postId}`}
                        className="text-muted-foreground ml-auto text-xs underline underline-offset-4"
                      >
                        Open post
                      </Link>
                    </div>

                    {task.postTitle ? (
                      <p className="text-sm font-medium">{task.postTitle}</p>
                    ) : null}

                    <div className="bg-muted/40 space-y-3 rounded-md border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {text || "No copy was provided for this platform yet."}
                        </p>
                        {text ? <CopyButton value={text} label="Copy" /> : null}
                      </div>
                      {task.profileUrl ? (
                        <p className="text-muted-foreground text-xs">
                          Publish on {platformLabel} → open the profile, create the post, paste the
                          copy, then come back and mark it completed.
                        </p>
                      ) : null}
                    </div>

                    <TargetActions
                      targetId={task.targetId}
                      status={task.targetStatus}
                      notes={task.notes}
                      canManageAny={canManageAny}
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-muted-foreground text-xs">
        <Badge variant="outline">Phase 1</Badge> Nothing is published automatically. Each target is
        completed by hand.
      </p>
    </>
  );
}
