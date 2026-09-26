"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  CheckSquare,
  FileText,
  Images,
  LayoutDashboard,
  Link2,
  ListChecks,
  Send,
  Share2,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  can,
  permissionsFor,
  PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";
import type { WorkspaceRole } from "@/generated/prisma/enums";

type NavItem = {
  href: Route;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/my-tasks", label: "My Tasks", icon: CheckSquare },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks },
  {
    href: "/dashboard/calendar",
    label: "Calendar",
    icon: CalendarDays,
    permission: PERMISSIONS.postRead,
  },
  { href: "/dashboard/posts", label: "Posts", icon: FileText, permission: PERMISSIONS.postRead },
  {
    href: "/dashboard/social-profiles",
    label: "Social Profiles",
    icon: Share2,
    permission: PERMISSIONS.profileRead,
  },
  { href: "/dashboard/media", label: "Media", icon: Images, permission: PERMISSIONS.mediaRead },
  {
    href: "/dashboard/connections",
    label: "Connections",
    icon: Link2,
    permission: PERMISSIONS.connectionRead,
  },
  {
    href: "/dashboard/publishing",
    label: "Publishing",
    icon: Send,
    permission: PERMISSIONS.publishRead,
  },
  { href: "/dashboard/team", label: "Team", icon: Users, permission: PERMISSIONS.teamRead },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
];

/** Left sidebar. Items the role cannot use are hidden rather than disabled. */
export function DashboardShell({
  role,
  children,
}: {
  role: WorkspaceRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="bg-background/60 hidden w-56 shrink-0 border-r md:block">
        <nav className="sticky top-14 space-y-1 p-3">
          {NAV_ITEMS.filter(
            (item) => !item.permission || can(permissionsFor(role), item.permission),
          ).map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
        <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
