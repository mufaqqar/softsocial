import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ReminderRunner } from "@/components/dashboard/reminder-runner";
import { WorkspaceNav } from "@/components/dashboard/workspace-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { Layers } from "lucide-react";
import { requireSession, requireWorkspace } from "@/lib/auth/dal";
import { countUnreadNotifications, listNotifications } from "@/lib/data/notifications";

export default async function DashboardGroupLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  if (session.workspaces.length === 0) {
    redirect("/onboarding");
  }

  const context = await requireWorkspace();
  const [unread, notifications] = await Promise.all([
    countUnreadNotifications(),
    listNotifications(8),
  ]);

  return (
    <div className="bg-muted/30 flex min-h-screen flex-col">
      <ReminderRunner />
      <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
              <Layers className="size-4" />
            </span>
            <span className="hidden font-semibold sm:inline">SoftSocial</span>
          </div>
          <WorkspaceNav
            activeWorkspaceId={context.workspace.id}
            workspaces={session.workspaces}
          />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell rows={notifications} unreadCount={unread} />
            <UserMenu
              name={context.user.name}
              email={context.user.email}
              role={context.workspace.role}
            />
          </div>
        </div>
      </header>
      <DashboardShell role={context.workspace.role}>{children}</DashboardShell>
    </div>
  );
}
