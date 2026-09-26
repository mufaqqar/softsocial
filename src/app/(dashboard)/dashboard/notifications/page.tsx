import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { markNotificationsReadAction } from "@/actions/workspace";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listNotifications } from "@/lib/data/notifications";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationsPage() {
  const notifications = await listNotifications(100);
  const hasUnread = notifications.some((row) => !row.readAt);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, completions and mentions for you."
        icon={Bell}
        actions={
          hasUnread ? (
            <form action={markNotificationsReadAction}>
              <Button type="submit" variant="outline" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {notifications.map((row) => (
                <li
                  key={row.id}
                  className={row.readAt ? "px-6 py-3 opacity-70" : "bg-muted/30 px-6 py-3"}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-sm font-medium">{row.title}</p>
                    {!row.readAt ? (
                      <span className="bg-primary size-1.5 rounded-full" aria-label="Unread" />
                    ) : null}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {formatDateTime(row.createdAt)}
                    </span>
                  </div>
                  {row.body ? <p className="text-muted-foreground text-sm">{row.body}</p> : null}
                  {row.entityType === "POST" && row.entityId ? (
                    <Link
                      href={`/dashboard/posts/${row.entityId}`}
                      className="text-primary text-xs underline underline-offset-4"
                    >
                      Open post
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
