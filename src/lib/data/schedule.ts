import "server-only";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import type { CalendarView } from "@/lib/constants";
import type { PostTargetStatus, SocialPlatform } from "@/generated/prisma/enums";
import type { CalendarFilter, TasksFilter } from "@/lib/validation/schedule";
import {
  dateKeyOf,
  effectiveTargetStatus,
  relativeMinutesLabel,
  timeKeyOf,
  todayKey,
  viewRange,
  zonedDayRange,
} from "@/lib/scheduling";

/**
 * Phase 2 read model (master.txt 2.1, 2.5, 2.6, 2.7, 2.9).
 *
 * Scheduling lives on `PostTarget`, never on `Post`: one post fans out to many
 * profiles and each of them has its own date, time and assignee. Every query is
 * scoped to the active workspace.
 */

export type ScheduleTargetRow = {
  id: string;
  postId: string;
  postTitle: string | null;
  postContent: string;
  /** Platform-specific copy where there is one, otherwise the shared copy. */
  copy: string;
  platform: SocialPlatform;
  socialProfileId: string;
  profileName: string;
  profileUrl: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  /** What is stored on the row. */
  storedStatus: PostTargetStatus;
  /** `storedStatus` with the Phase 2 OVERDUE rule applied. */
  status: PostTargetStatus;
  scheduledAt: Date;
  /**
   * Wall date/time in the timezone the target is scheduled in. These are what
   * the author typed, so the schedule dialog edits them without shifting the day.
   */
  dateKey: string;
  timeKey: string;
  timeZone: string;
  /**
   * The same instant in the workspace timezone. Every grid, list and count in
   * Phase 2 is a workspace-time view, so this pair is what a row is bucketed and
   * displayed by. Without the split, a task typed as 23:00 in one zone would sit
   * under a different day than the one the calendar shows.
   */
  viewDateKey: string;
  viewTimeKey: string;
  reminderAt: Date | null;
  completedAt: Date | null;
  notes: string | null;
};

const scheduleTargetSelect = {
  id: true,
  postId: true,
  assignedUserId: true,
  status: true,
  scheduledAt: true,
  timezone: true,
  reminderAt: true,
  completedAt: true,
  notes: true,
  assignedUser: { select: { name: true } },
  socialProfile: {
    select: { id: true, platform: true, name: true, profileUrl: true },
  },
  post: {
    select: {
      title: true,
      content: true,
      variants: { select: { platform: true, text: true } },
    },
  },
} as const;

type ScheduleTargetRecord = {
  id: string;
  postId: string;
  assignedUserId: string | null;
  status: PostTargetStatus;
  scheduledAt: Date | null;
  timezone: string | null;
  reminderAt: Date | null;
  completedAt: Date | null;
  notes: string | null;
  assignedUser: { name: string } | null;
  socialProfile: {
    id: string;
    platform: SocialPlatform;
    name: string;
    profileUrl: string | null;
  };
  post: {
    title: string | null;
    content: string;
    variants: { platform: SocialPlatform; text: string }[];
  };
};

type ScheduleFilterShape = Omit<CalendarFilter, "view" | "date">;

/** master.txt 2.9: dedicated platform copy first, then the shared copy. */
function resolveCopy(target: ScheduleTargetRecord): string {
  const platform = target.socialProfile.platform;
  const variant = target.post.variants.find((candidate) => candidate.platform === platform);

  return variant?.text.trim() || target.post.content.trim();
}

function toRow(
  target: ScheduleTargetRecord,
  workspaceTimeZone: string,
  now: Date,
): ScheduleTargetRow {
  const scheduledAt = target.scheduledAt!;
  const timeZone = target.timezone ?? workspaceTimeZone;

  return {
    ...toSharedRow(target),
    storedStatus: target.status,
    status: effectiveTargetStatus(target.status, scheduledAt, now),
    scheduledAt,
    dateKey: dateKeyOf(scheduledAt, timeZone),
    timeKey: timeKeyOf(scheduledAt, timeZone),
    timeZone,
    viewDateKey: dateKeyOf(scheduledAt, workspaceTimeZone),
    viewTimeKey: timeKeyOf(scheduledAt, workspaceTimeZone),
    reminderAt: target.reminderAt,
  };
}

/** The post, profile and assignee columns every schedule surface needs. */
function toSharedRow(target: ScheduleTargetRecord) {
  return {
    id: target.id,
    postId: target.postId,
    postTitle: target.post.title,
    postContent: target.post.content,
    copy: resolveCopy(target),
    platform: target.socialProfile.platform,
    socialProfileId: target.socialProfile.id,
    profileName: target.socialProfile.name,
    profileUrl: target.socialProfile.profileUrl,
    assignedUserId: target.assignedUserId,
    assignedUserName: target.assignedUser?.name ?? null,
    storedStatus: target.status,
    completedAt: target.completedAt,
    notes: target.notes,
  };
}

/**
 * Prisma cannot compare one column against another, so "overdue" is expressed as
 * "still PENDING and due in the past" and then re-checked per row. A stored
 * `OVERDUE` is accepted too so the filter keeps working if the flag is ever
 * written back.
 */
function buildStatusFilter(
  status: ScheduleFilterShape["status"],
  window: { gte: Date; lt: Date } | null,
  now: Date,
) {
  if (!status) {
    return window ? { scheduledAt: window } : {};
  }

  if (status === "OVERDUE") {
    return {
      status: { in: ["PENDING", "OVERDUE"] as PostTargetStatus[] },
      scheduledAt: window ? { ...window, lte: now } : { lte: now },
    };
  }

  return {
    status: { in: [status] as PostTargetStatus[] },
    ...(window ? { scheduledAt: window } : {}),
  };
}

function buildOwnerFilter(filter: { assignedUserId?: string | null; platform?: SocialPlatform; socialProfileId?: string | null }) {
  return {
    ...(filter.assignedUserId ? { assignedUserId: filter.assignedUserId } : {}),
    ...(filter.platform ? { socialProfile: { platform: filter.platform } } : {}),
    ...(filter.socialProfileId ? { socialProfileId: filter.socialProfileId } : {}),
  };
}

/** Shared query for anything that renders as a calendar or task row. */
async function fetchRows(
  workspaceId: string,
  workspaceTimeZone: string,
  where: Record<string, unknown>,
  now: Date,
): Promise<ScheduleTargetRow[]> {
  const targets = (await prisma.postTarget.findMany({
    where: { workspaceId, scheduledAt: { not: null }, ...where },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    select: scheduleTargetSelect,
  })) as ScheduleTargetRecord[];

  return targets
    .filter((target) => target.scheduledAt !== null)
    .map((target) => toRow(target, workspaceTimeZone, now));
}

/**
 * A target with no date yet. It is deliberately a separate type from
 * `ScheduleTargetRow`: the calendar can only place a row that has a day, so
 * pretending an undated target has one would put it in a cell it does not
 * belong to. `status` is the stored value here, because OVERDUE is derived from
 * a date and an undated target is not late for anything.
 */
export type UnscheduledTargetRow = Omit<
  ScheduleTargetRow,
  | "scheduledAt"
  | "dateKey"
  | "timeKey"
  | "timeZone"
  | "viewDateKey"
  | "viewTimeKey"
  | "reminderAt"
  | "status"
> & {
  scheduledAt: null;
  dateKey: null;
  timeKey: null;
  timeZone: null;
  viewDateKey: null;
  viewTimeKey: null;
  reminderAt: null;
  status: PostTargetStatus;
};

async function fetchUnscheduledRows(
  workspaceId: string,
  where: Record<string, unknown>,
): Promise<UnscheduledTargetRow[]> {
  const targets = (await prisma.postTarget.findMany({
    where: { workspaceId, scheduledAt: null, ...where },
    orderBy: { createdAt: "asc" },
    select: scheduleTargetSelect,
  })) as ScheduleTargetRecord[];

  return targets.map((target) => ({
    ...toSharedRow(target),
    scheduledAt: null,
    dateKey: null,
    timeKey: null,
    timeZone: null,
    viewDateKey: null,
    viewTimeKey: null,
    reminderAt: null,
    status: target.status,
  }));
}

/**
 * The rows one calendar view renders. The query window is the visible grid, and
 * each row then carries its own `dateKey` so the client can bucket it by the day
 * the assignee actually sees rather than by UTC.
 */
export async function listCalendarTargets(
  view: CalendarView,
  anchorKey: string,
  filter: ScheduleFilterShape,
  now: Date = new Date(),
): Promise<ScheduleTargetRow[]> {
  const { workspace } = await requireWorkspace();
  const range = viewRange(view, anchorKey, workspace.timezone, 30);
  const window = { gte: range.from, lt: range.to };

  return fetchRows(
    workspace.id,
    workspace.timezone,
    { ...buildOwnerFilter(filter), ...buildStatusFilter(filter.status, window, now) },
    now,
  );
}

export type DailyTasks = {
  dateKey: string;
  /** Everything with a date that falls on `dateKey`. */
  scheduled: ScheduleTargetRow[];
  /** Phase 1 targets that have no date yet. */
  unscheduled: UnscheduledTargetRow[];
  overdue: ScheduleTargetRow[];
};

/**
 * master.txt 2.6. Completed and cancelled work is hidden unless asked for, and
 * anything already past due is surfaced at the top rather than only appearing on
 * the day it was missed.
 */
export async function listDailyTasks(
  filter: TasksFilter,
  now: Date = new Date(),
): Promise<DailyTasks> {
  const { workspace } = await requireWorkspace();
  const dateKey = filter.date ?? todayKey(now, workspace.timezone);
  const range = zonedDayRange(dateKey, workspace.timezone);
  const owner = buildOwnerFilter(filter);
  const hidden = filter.includeCompleted
    ? {}
    : { status: { notIn: ["COMPLETED", "CANCELLED"] as PostTargetStatus[] } };

  const [scheduled, unscheduled, overdue] = await Promise.all([
    fetchRows(
      workspace.id,
      workspace.timezone,
      { ...owner, ...hidden, scheduledAt: { gte: range.from, lt: range.to } },
      now,
    ),
    fetchUnscheduledRows(workspace.id, { ...owner, ...hidden }),
    fetchRows(
      workspace.id,
      workspace.timezone,
      { ...owner, ...hidden, status: "PENDING", scheduledAt: { lte: now } },
      now,
    ),
  ]);

  // A target that is both due today and already past due is one row, not two.
  const todayIds = new Set(scheduled.map((row) => row.id));

  return { dateKey, scheduled, unscheduled, overdue: overdue.filter((row) => !todayIds.has(row.id)) };
}

export type ScheduleSummary = {
  todayTotal: number;
  todayCompleted: number;
  todayPending: number;
  todayOverdue: number;
  /** Scheduled from tomorrow onwards and still outstanding. */
  upcoming: number;
  /** Past due and still PENDING, anywhere in the workspace. */
  overdue: number;
  /** Undated targets still waiting on somebody. */
  unscheduled: number;
};

/** master.txt 2.9, one count per bucket. */
export async function getScheduleSummary(
  assignedUserId: string | null = null,
  now: Date = new Date(),
): Promise<ScheduleSummary> {
  const { workspace } = await requireWorkspace();
  const scope = assignedUserId ? { assignedUserId } : {};
  const day = zonedDayRange(todayKey(now, workspace.timezone), workspace.timezone);
  const outstanding: PostTargetStatus[] = ["PENDING", "IN_PROGRESS", "OVERDUE"];
  const base = { workspaceId: workspace.id, ...scope };

  const [
    todayTotal,
    todayCompleted,
    todayPending,
    todayOverdue,
    upcoming,
    overdue,
    unscheduled,
  ] = await Promise.all([
    prisma.postTarget.count({ where: { ...base, scheduledAt: { gte: day.from, lt: day.to } } }),
    prisma.postTarget.count({
      where: { ...base, status: "COMPLETED", scheduledAt: { gte: day.from, lt: day.to } },
    }),
    prisma.postTarget.count({
      where: { ...base, status: { in: outstanding }, scheduledAt: { gte: day.from, lt: day.to } },
    }),
    prisma.postTarget.count({
      where: { ...base, status: { in: outstanding }, scheduledAt: { lt: day.from } },
    }),
    prisma.postTarget.count({
      where: { ...base, status: { in: outstanding }, scheduledAt: { gte: day.to } },
    }),
    prisma.postTarget.count({ where: { ...base, status: "PENDING", scheduledAt: { lte: now } } }),
    prisma.postTarget.count({ where: { ...base, status: { in: outstanding }, scheduledAt: null } }),
  ]);

  return {
    todayTotal,
    todayCompleted,
    todayPending,
    todayOverdue,
    upcoming,
    overdue,
    unscheduled,
  };
}

export type ReminderRow = {
  targetId: string;
  postId: string;
  title: string;
  body: string;
};

/**
 * master.txt 2.7: in-app reminders.
 *
 * A phase never schedules with `setTimeout`, and Phase 2 has no worker yet, so
 * instead of a timer this is driven from the pages the assignee is already
 * looking at: whenever a dashboard, calendar or task list renders, a reminder
 * whose moment has arrived is turned into a notification. A reminder therefore
 * cannot fire while the app is closed - the honest limit of an in-app reminder
 * with no background process behind it. `deliverDueReminders` makes each one
 * exactly once.
 */
export async function listDueReminders(
  now: Date = new Date(),
  limit = 20,
): Promise<ReminderRow[]> {
  const { workspace, user } = await requireWorkspace();

  const targets = await prisma.postTarget.findMany({
    where: {
      workspaceId: workspace.id,
      assignedUserId: user.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      reminderAt: { not: null, lte: now },
      scheduledAt: { not: null, gt: now },
    },
    orderBy: { reminderAt: "asc" },
    take: limit,
    select: {
      id: true,
      postId: true,
      reminderAt: true,
      scheduledAt: true,
      timezone: true,
      socialProfile: { select: { name: true } },
      post: { select: { title: true } },
    },
  });

  return targets.map((target) => {
    const timeZone = target.timezone ?? workspace.timezone;
    const lead = Math.round(
      (target.scheduledAt!.getTime() - target.reminderAt!.getTime()) / 60_000,
    );
    const name = target.socialProfile.name;
    const title = target.post.title ?? "Untitled post";

    return {
      targetId: target.id,
      postId: target.postId,
      title: `${name} is scheduled ${relativeMinutesLabel(lead)}`,
      body: `${title} goes out at ${timeKeyOf(target.scheduledAt!, timeZone)} (${timeZone}).`,
    };
  });
}
