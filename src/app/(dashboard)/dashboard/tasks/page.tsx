import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckSquare, ListChecks } from "lucide-react";

import { ScheduleDialog } from "@/components/calendar/schedule-dialog";

import { PageHeader, EmptyState } from "@/components/page-header";
import { PlatformBadge, TargetStatusBadge } from "@/components/status-badges";
import { TargetActions } from "@/components/tasks/target-actions";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import {
  listDailyTasks,
  type ScheduleTargetRow,
  type UnscheduledTargetRow,
} from "@/lib/data/schedule";
import { PLATFORM_LABELS } from "@/lib/constants";
import { relativeDayLabel } from "@/lib/scheduling";
import { tasksFilterSchema } from "@/lib/validation/schedule";
import { TasksDayNav } from "@/components/calendar/tasks-day-nav";

export const metadata: Metadata = {
  title: "Tasks",
};

export default async function TasksPage({ searchParams }: PageProps<"/dashboard/tasks">) {
  const context = await requireWorkspace();
  const params = await searchParams;

  const filter = tasksFilterSchema.parse({
    date: params.date,
    assignedUserId: params.assignedUserId,
    platform: params.platform,
    includeCompleted: params.includeCompleted,
  });

  const { scheduled, unscheduled, overdue, dateKey } = await listDailyTasks(filter);
  const canManageAny = can(context.permissions, PERMISSIONS.targetUpdateAny);
  const timeZone = context.workspace.timezone;

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything due on a given day, plus anything still waiting to be scheduled. Copy the text, publish by hand, then mark it done."
        icon={ListChecks}
      />

      <TasksDayNav
        dateKey={dateKey}
        timeZone={timeZone}
        assignedUserId={filter.assignedUserId}
        includeCompleted={filter.includeCompleted}
      />

      {overdue.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Badge variant="warning">Overdue</Badge>
            <span className="text-muted-foreground font-normal">
              Past due and still waiting
            </span>
          </h2>
          <ul className="space-y-3">
            {overdue.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                timeZone={timeZone}
                canManageAny={canManageAny}              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Due {relativeDayLabel(dateKey, timeZone).toLowerCase()} ({scheduled.length})
        </h2>

        {scheduled.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
            Nothing is scheduled for this day.
          </p>
        ) : (
          <ul className="space-y-3">
            {scheduled.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                timeZone={timeZone}
                canManageAny={canManageAny}              />
            ))}
          </ul>
        )}
      </section>

      {unscheduled.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Not scheduled yet ({unscheduled.length})
          </h2>
          <p className="text-muted-foreground text-xs">
            These targets have no date yet. Give them a slot on the calendar to pull them into a
            day.
          </p>
          <ul className="space-y-3">
            {unscheduled.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                timeZone={timeZone}
                canManageAny={canManageAny}              />
            ))}
          </ul>
        </section>
      ) : null}

      {overdue.length === 0 && scheduled.length === 0 && unscheduled.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Nothing to do"
          description="No tasks are due on this day and nothing is waiting to be scheduled."
          action={{ label: "Open the calendar", href: "/dashboard/calendar" }}
        />
      ) : null}

      <p className="text-muted-foreground text-xs">
        <Badge variant="outline">Phase 2</Badge> Scheduling decides <em>when</em> a task is due.
        Publishing is still done by hand, and nothing is sent to a platform automatically.
      </p>
    </>
  );
}

function TaskCard({
  task,
  timeZone,
  canManageAny,
}: {
  task: ScheduleTargetRow | UnscheduledTargetRow;
  timeZone: string;
  canManageAny: boolean;
}) {
  const scheduled = task.scheduledAt !== null;

  return (
    <li>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformBadge platform={task.platform} />
            <TargetStatusBadge status={task.status} />
            <span className="text-sm font-medium">{task.profileName}</span>
            {scheduled ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                {task.viewTimeKey}
                {task.timeZone === timeZone ? null : ` ${task.timeZone}`}
              </span>
            ) : (
              <Badge variant="outline">No date</Badge>
            )}
            {canManageAny ? (
              <ScheduleDialog
                targetId={task.id}
                profileName={task.profileName}
                initialDate={task.dateKey}
                initialTime={task.timeKey}
                initialTimeZone={task.timeZone}
                initialAssigneeId={task.assignedUserId}
                initialReminderLeadMinutes={
                  task.scheduledAt && task.reminderAt
                    ? Math.round(
                        (task.scheduledAt.getTime() - task.reminderAt.getTime()) / 60_000,
                      )
                    : 0
                }
                assignees={[]}
                workspaceTimeZone={timeZone}
              />
            ) : null}
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
                {task.copy || "No copy was provided for this platform yet."}
              </p>
              {task.copy ? <CopyButton value={task.copy} label="Copy" /> : null}
            </div>
            {task.profileUrl ? (
              <p className="text-muted-foreground text-xs">
                Publish on {PLATFORM_LABELS[task.platform]} â†’ open the profile, create the post,
                paste the copy, then come back and mark it completed.
              </p>
            ) : null}
          </div>

          <TargetActions
            targetId={task.id}
            status={task.storedStatus}
            notes={task.notes}
            canManageAny={canManageAny}
          />

          {scheduled ? (
            <p className="text-muted-foreground text-xs">
              <Link
                href={`/dashboard/calendar?date=${task.viewDateKey}`}
                className="inline-flex items-center gap-1 underline underline-offset-4"
              >
                <CalendarDays className="size-3" />
                Open in the calendar
              </Link>
              {task.assignedUserName ? ` · assigned to ${task.assignedUserName}` : null}
              {` · shown in ${timeZone}`}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}
