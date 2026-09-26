import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, FileText } from "lucide-react";

import { CalendarBoard } from "@/components/calendar/calendar-board";
import { CalendarFilters } from "@/components/calendar/calendar-filters";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { ScheduleDialog } from "@/components/calendar/schedule-dialog";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { listCalendarTargets, type ScheduleTargetRow } from "@/lib/data/schedule";
import { listSelectableProfiles } from "@/lib/data/social-profiles";
import { listAssignableMembers } from "@/lib/data/team";
import { calendarFilterSchema } from "@/lib/validation/schedule";
import { AGENDA_DAYS, CALENDAR_VIEW_LABELS } from "@/lib/constants";
import { todayKey } from "@/lib/scheduling";

export const metadata: Metadata = {
  title: "Calendar",
};

export default async function CalendarPage({ searchParams }: PageProps<"/dashboard/calendar">) {
  const context = await requireWorkspace();
  const params = await searchParams;

  const filter = calendarFilterSchema.parse({
    view: params.view,
    date: params.date,
    assignedUserId: params.assignedUserId,
    platform: params.platform,
    socialProfileId: params.socialProfileId,
    status: params.status,
  });

  const anchorKey = filter.date ?? todayKey(new Date(), context.workspace.timezone);
  const now = new Date();

  const [tasks, profiles, members] = await Promise.all([
    listCalendarTargets(
      filter.view,
      anchorKey,
      {
        assignedUserId: filter.assignedUserId,
        platform: filter.platform,
        socialProfileId: filter.socialProfileId,
        status: filter.status,
      },
      now,
    ),
    listSelectableProfiles(),
    listAssignableMembers(),
  ]);

  const canEdit = can(context.permissions, PERMISSIONS.postManage);
  const canReadPosts = can(context.permissions, PERMISSIONS.postRead);
  const today = todayKey(now, context.workspace.timezone);
  const hasFilters = Boolean(
    filter.status || filter.assignedUserId || filter.platform || filter.socialProfileId,
  );

  return (
    <>
      <PageHeader
        title="Content calendar"
        description={`Everything scheduled in ${context.workspace.name}. Drag a task to another day to reschedule it.`}
        icon={CalendarDays}
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/dashboard/posts/new">
                <FileText />
                New post
              </Link>
            </Button>
          ) : null
        }
      />

      <CalendarToolbar
        view={filter.view}
        anchorKey={anchorKey}
        timeZone={context.workspace.timezone}
      />

      <CalendarFilters
        members={members.map((member) => ({
          userId: member.userId,
          name: member.user.name,
        }))}
        profiles={profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          platform: profile.platform,
        }))}
        timeZone={context.workspace.timezone}
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={
            hasFilters
              ? "Nothing matches these filters"
              : `Nothing scheduled in this ${CALENDAR_VIEW_LABELS[filter.view].toLowerCase()}`
          }
          description={
            hasFilters
              ? "Try clearing a filter to see more of the calendar."
              : "Schedule a target from a post, and it will appear here."
          }
          action={
            canEdit
              ? { label: "Create a post", href: "/dashboard/posts/new" }
              : { label: "Open My Tasks", href: "/dashboard/my-tasks" }
          }
        />
      ) : (
        <CalendarBoard
          view={filter.view}
          anchorKey={anchorKey}
          tasks={tasks}
          timeZone={context.workspace.timezone}
          todayKey={today}
          canEdit={canEdit}
          emptySlot={
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled"
              description={`No work in the next ${AGENDA_DAYS} days.`}
            />
          }
        />
      )}

      {tasks.length > 0 ? (
        <ScheduleLegend
          tasks={tasks}
          canEdit={canEdit}
          canReadPosts={canReadPosts}
          timeZone={context.workspace.timezone}
          assignees={members.map((member) => ({
            userId: member.userId,
            name: member.user.name,
          }))}
        />
      ) : null}
    </>
  );
}

/**
 * A plain list under the board. The month grid deliberately shows only the first
 * few tasks per cell, so this is where the full set stays reachable - and it is
 * the only place a task can be scheduled or reassigned without a drag.
 */
function ScheduleLegend({
  tasks,
  canEdit,
  canReadPosts,
  timeZone,
  assignees,
}: {
  tasks: ScheduleTargetRow[];
  canEdit: boolean;
  canReadPosts: boolean;
  timeZone: string;
  assignees: { userId: string; name: string }[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">All tasks in view ({tasks.length})</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {tasks.map((task) => (
          <li key={task.id} className="bg-card flex items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-sm font-medium">
                {canReadPosts ? (
                  <Link href={`/dashboard/posts/${task.postId}`} className="hover:underline">
                    {task.postTitle || task.copy || "Untitled post"}
                  </Link>
                ) : (
                  (task.postTitle ?? "Untitled post")
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {task.profileName} · {task.viewDateKey} at {task.viewTimeKey} ({timeZone})
              </p>
              {task.status === "OVERDUE" ? (
                <p className="text-warning text-xs">Overdue</p>
              ) : null}
            </div>

            {canEdit ? (
              <ScheduleDialog
                targetId={task.id}
                profileName={task.profileName}
                initialDate={task.dateKey}
                initialTime={task.timeKey}
                initialTimeZone={task.timeZone}
                initialAssigneeId={task.assignedUserId}
                initialReminderLeadMinutes={
                  task.reminderAt
                    ? Math.round(
                        (task.scheduledAt.getTime() - task.reminderAt.getTime()) / 60_000,
                      )
                    : 0
                }
                assignees={assignees}
                workspaceTimeZone={timeZone}
                trigger={
                  <span className="text-primary shrink-0 text-xs underline underline-offset-4">
                    Reschedule
                  </span>
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
