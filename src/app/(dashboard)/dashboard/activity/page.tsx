import type { Metadata } from "next";
import { Activity } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listActivity } from "@/lib/data/dashboard";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Activity",
};

const ACTION_LABELS: Record<string, string> = {
  WORKSPACE_CREATED: "Workspace created",
  WORKSPACE_UPDATED: "Workspace updated",
  MEMBER_INVITED: "Member added",
  MEMBER_ROLE_CHANGED: "Role changed",
  MEMBER_STATUS_CHANGED: "Access changed",
  MEMBER_REMOVED: "Member removed",
  SOCIAL_PROFILE_CREATED: "Profile added",
  SOCIAL_PROFILE_UPDATED: "Profile updated",
  SOCIAL_PROFILE_REMOVED: "Profile removed",
  POST_CREATED: "Post created",
  POST_UPDATED: "Post updated",
  POST_CANCELLED: "Post deleted",
  POST_TARGET_STATUS_CHANGED: "Target updated",
  POST_COMMENT_ADDED: "Comment added",
  MEDIA_UPLOADED: "Media uploaded",
  MEDIA_REMOVED: "Media deleted",
};

export default async function ActivityPage() {
  const { rows } = await listActivity(100);

  return (
    <>
      <PageHeader
        title="Activity"
        description="An audit trail of everything that happened in this workspace."
        icon={Activity}
      />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground px-6 py-10 text-center text-sm">
              No activity recorded yet.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline gap-2 px-6 py-3">
                  <Badge variant="outline" className="shrink-0">
                    {ACTION_LABELS[row.action] ?? row.action}
                  </Badge>
                  <span className="min-w-0 flex-1 text-sm">{row.summary}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {row.userName ? `${row.userName} · ` : ""}
                    {formatDateTime(row.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
