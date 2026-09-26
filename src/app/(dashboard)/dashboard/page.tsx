import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  FileText,
  ListChecks,
  Share2,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SectionCard, StatCard } from "@/components/stat-card";
import { PostStatusBadge, PlatformBadge, TargetStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { getDashboardStats, listMyActivity } from "@/lib/data/dashboard";
import { getScheduleSummary, listDailyTasks } from "@/lib/data/schedule";
import { listMyTaskRows } from "@/lib/data/posts";
import { formatDate, truncate } from "@/lib/format";
import { relativeDayLabel } from "@/lib/scheduling";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const context = await requireWorkspace();
  const timeZone = context.workspace.timezone;
  const [stats, tasks, activity, schedule, today] = await Promise.all([
    getDashboardStats(),
    listMyTaskRows(),
    listMyActivity(8),
    getScheduleSummary(),
    listDailyTasks({ assignedUserId: null, includeCompleted: false }),
  ]);

  const canCreate = can(context.permissions, PERMISSIONS.postManage);
  const openTasks = tasks.slice(0, 5);
  const dueToday = today.scheduled.slice(0, 5);
  const attention = today.overdue.slice(0, 5);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${context.user.name.split(" ")[0]}`}
        description={`${context.workspace.name} · ${timeZone}`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/dashboard/posts/new">
                <FileText />
                New post
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Due today"
          value={schedule.todayTotal}
          hint={
            schedule.todayOverdue > 0
              ? `${schedule.todayOverdue} already overdue`
              : `${schedule.todayCompleted} completed`
          }
          icon={CalendarDays}
          tone={schedule.todayOverdue > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Overdue"
          value={schedule.overdue}
          hint="Past due and not published"
          icon={AlertTriangle}
          tone={schedule.overdue > 0 ? "destructive" : "default"}
        />
        <StatCard
          label="Upcoming"
          value={schedule.upcoming}
          hint="Scheduled from tomorrow"
          icon={CalendarClock}
        />
        <StatCard
          label="Not scheduled"
          value={schedule.unscheduled}
          hint="Targets with no date yet"
          icon={ListChecks}
          tone={schedule.unscheduled > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending tasks"
          value={stats.pendingTasks}
          hint="Not published yet"
          icon={CheckSquare}
          tone={stats.pendingTasks > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Completed tasks"
          value={stats.completedTasks}
          hint="Published manually"
          icon={CheckSquare}
          tone="success"
        />
        <StatCard
          label="Social profiles"
          value={stats.totalProfiles}
          hint={`${stats.facebookProfiles} Facebook · ${stats.linkedinProfiles} LinkedIn`}
          icon={Share2}
        />
        <StatCard
          label="Team members"
          value={stats.teamMembers}
          hint={`${stats.totalPosts} posts in total`}
          icon={Users}
        />
      </div>

      {attention.length > 0 ? (
        <SectionCard
          title="Overdue"
          description="These were due before today and nobody has published them yet."
          contentClassName="p-0"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/tasks">
                View tasks
                <ArrowRight />
              </Link>
            </Button>
          }
        >
          <ul className="divide-y">
            {attention.map((task) => (
              <li key={task.id} className="flex items-start gap-3 px-6 py-3">
                <PlatformBadge platform={task.platform} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Link
                    href={`/dashboard/posts/${task.postId}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {task.postTitle || truncate(task.copy, 60) || "Untitled post"}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {task.profileName} · was due {task.viewDateKey} at {task.viewTimeKey}
                  </p>
                </div>
                <TargetStatusBadge status={task.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title={`Due ${relativeDayLabel(today.dateKey, timeZone).toLowerCase()}`}
          description="Scheduled work for today across the whole team."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/calendar">
                Open calendar
                <ArrowRight />
              </Link>
            </Button>
          }
          contentClassName="p-0"
        >
          {dueToday.length === 0 ? (
            <p className="text-muted-foreground px-6 py-10 text-center text-sm">
              Nothing is scheduled for today.
            </p>
          ) : (
            <ul className="divide-y">
              {dueToday.map((task) => (
                <li key={task.id} className="flex items-start gap-3 px-6 py-3">
                  <PlatformBadge platform={task.platform} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Link
                      href={`/dashboard/posts/${task.postId}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {task.postTitle || truncate(task.copy, 60) || "Untitled post"}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {task.profileName} · {task.viewTimeKey}
                      {task.assignedUserName ? ` · ${task.assignedUserName}` : null}
                    </p>
                  </div>
                  <TargetStatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="My open tasks"
          description="Assigned to you, whenever they are due."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/my-tasks">
                View all
                <ArrowRight />
              </Link>
            </Button>
          }
          contentClassName="p-0"
        >
          {openTasks.length === 0 ? (
            <p className="text-muted-foreground px-6 py-10 text-center text-sm">
              Nothing is waiting on you right now.
            </p>
          ) : (
            <ul className="divide-y">
              {openTasks.map((task) => (
                <li key={task.targetId} className="flex items-start gap-3 px-6 py-3">
                  <PlatformBadge platform={task.platform} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Link
                      href={`/dashboard/posts/${task.postId}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {task.postTitle || truncate(task.postContent, 60) || "Untitled post"}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {task.profileName} · created {formatDate(task.postCreatedAt)}
                    </p>
                  </div>
                  <PostStatusBadge status={task.postStatus} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent activity" contentClassName="p-0">
        {activity.length === 0 ? (
          <p className="text-muted-foreground px-6 py-10 text-center text-sm">
            Your activity will show up here.
          </p>
        ) : (
          <ul className="divide-y">
            {activity.map((row) => (
              <li key={row.id} className="px-6 py-3">
                <p className="text-sm">{row.summary}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatDate(row.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t px-6 py-2">
          <Link
            href="/dashboard/activity"
            className="text-primary text-xs underline underline-offset-4"
          >
            View workspace activity
          </Link>
        </div>
      </SectionCard>

      {stats.failedTasks > 0 ? (
        <SectionCard title="Needs attention">
          <p className="text-sm">
            <Badge variant="destructive">{stats.failedTasks}</Badge>{" "}
            <span className="text-muted-foreground">
              task(s) are marked failed. Open Tasks to retry or reassign them.
            </span>
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/dashboard/tasks">Open Tasks</Link>
          </Button>
        </SectionCard>
      ) : null}

      <p className="text-muted-foreground text-xs">
        <Badge variant="outline">Phase 2</Badge> Scheduling decides when work is due. Publishing is
        still completed by hand, and nothing is sent to a platform automatically.
      </p>
    </>
  );
}
