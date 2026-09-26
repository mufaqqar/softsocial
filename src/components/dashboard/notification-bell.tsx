"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { markNotificationsReadAction } from "@/actions/workspace";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { timeAgo } from "@/lib/format";
import type { NotificationRow } from "@/lib/data/notifications";

/**
 * Top-bar notifications popover. Rows are fetched on the server by the layout
 * and handed in as props because the data layer is server-only.
 */
export function NotificationBell({
  rows,
  unreadCount,
}: {
  rows: NotificationRow[];
  unreadCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [read, setRead] = useState(false);

  const allRead = read || unreadCount === 0;

  function markAllRead() {
    startTransition(async () => {
      await markNotificationsReadAction(new FormData());
      setRead(true);
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell />
          {!allRead ? (
            <span className="bg-destructive text-background absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {!allRead ? (
            <button
              type="button"
              onClick={markAllRead}
              disabled={pending}
              className="text-primary text-xs underline underline-offset-4 disabled:opacity-50"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              Nothing new right now.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={allRead || row.readAt ? "opacity-70" : undefined}
                >
                  <Link href="/dashboard/notifications" className="block px-3 py-2.5">
                    <p className="text-sm font-medium">{row.title}</p>
                    {row.body ? (
                      <p className="text-muted-foreground line-clamp-2 text-xs">{row.body}</p>
                    ) : null}
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      {timeAgo(row.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t px-3 py-2 text-center">
          <Link
            href="/dashboard/notifications"
            className="text-primary text-xs underline underline-offset-4"
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
