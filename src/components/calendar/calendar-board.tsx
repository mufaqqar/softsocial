"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, GripVertical, UserRound } from "lucide-react";

import { moveTargetAction } from "@/actions/schedule";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge, TargetStatusBadge } from "@/components/status-badges";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { cn } from "@/lib/utils";
import {
  dayTitle,
  minuteOf,
  monthGrid,
  monthTitle,
  relativeDayLabel,
  weekDateKeys,
  weekTitle,
  type DateKey,
} from "@/lib/scheduling";
import type { ScheduleTargetRow } from "@/lib/data/schedule";
import type { CalendarView } from "@/lib/constants";

export type CalendarTask = ScheduleTargetRow;

type Props = {
  view: CalendarView;
  anchorKey: DateKey;
  tasks: CalendarTask[];
  timeZone: string;
  todayKey: DateKey;
  canEdit: boolean;
  /** Rendered when the visible range holds no scheduled work. */
  emptySlot: React.ReactNode;
};

/** Monday-first column headings, used by the month and week grids. */
const WEEKDAY_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * master.txt 2.1-2.4. One client component renders all four views so that
 * switching between them is instant and, more importantly, so they cannot drift
 * apart in how they read a schedule.
 *
 * Drag and drop uses the native HTML5 drag events rather than a library: the only
 * thing being moved is a date and a time, and the drop is resolved back to an
 * instant on the server. A drag therefore cannot invent a schedule the client
 * cannot prove.
 */
export function CalendarBoard({
  view,
  anchorKey,
  tasks,
  timeZone,
  todayKey,
  canEdit,
  emptySlot,
}: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byDay = useMemo(() => {
    const grouped = new Map<string, CalendarTask[]>();

    for (const task of tasks) {
      const existing = grouped.get(task.viewDateKey);
      if (existing) {
        existing.push(task);
      } else {
        grouped.set(task.viewDateKey, [task]);
      }
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    }

    return grouped;
  }, [tasks]);

  /**
   * A drop carries the target id and the day it landed on. The time is only
   * changed in the time-based views, where the drop point has a real y position;
   * in a month cell the task keeps the time of day it already had.
   */
  function beginDrag(event: React.DragEvent, task: CalendarTask) {
    if (!canEdit || task.status === "COMPLETED" || task.status === "CANCELLED") {
      event.preventDefault();
      return;
    }

    setDragging(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  }

  function endDrag() {
    setDragging(null);
    setDropTarget(null);
  }

  function allowDrop(event: React.DragEvent) {
    if (!canEdit || !dragging) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function overDrop(event: React.DragEvent, dateKey: DateKey) {
    if (!canEdit || !dragging) {
      return;
    }

    event.preventDefault();
    setDropTarget(dateKey);
  }

  /**
   * `dragleave` also fires when the pointer crosses a child inside the same cell,
   * so the highlight is only dropped once the pointer truly leaves this day.
   */
  function leaveDrop(dateKey: DateKey) {
    setDropTarget((current) => (current === dateKey ? null : current));
  }

  function drop(event: React.DragEvent, dateKey: DateKey, timeKey?: string) {
    event.preventDefault();

    const targetId = event.dataTransfer.getData("text/plain") || dragging;
    setDropTarget(null);
    setDragging(null);

    if (!canEdit || !targetId) {
      return;
    }

    const task = tasks.find((candidate) => candidate.id === targetId);
    if (!task) {
      return;
    }

    // The grid is drawn in the workspace timezone, so a drop is a workspace
    // wall date and time. The target keeps its own zone only as metadata for the
    // edit dialog; rescheduling is always expressed in the zone being displayed.
    const nextTime = timeKey ?? task.viewTimeKey;
    const formData = new FormData();
    formData.set(
      "payload",
      JSON.stringify({
        targetId,
        date: dateKey,
        time: nextTime,
        timeZone,
        assignedUserId: task.assignedUserId,
      }),
    );

    startTransition(async () => {
      const result = await moveTargetAction(EMPTY_FORM_STATE, formData);
      setMoveError(result?.error ?? null);
      router.refresh();
    });
  }

  const shared = {
    tasks,
    timeZone,
    todayKey,
    canEdit,
    dragging,
    dropTarget,
    byDay,
    beginDrag,
    endDrag,
    allowDrop,
    overDrop,
    leaveDrop,
    drop,
  };

  return (
    <div className="space-y-3">
      {moveError ? (
        <p className="text-destructive text-sm" role="alert">
          {moveError}
        </p>
      ) : null}
      {pending ? (
        <p className="text-muted-foreground text-xs" role="status">
          Movingâ€¦
        </p>
      ) : null}

      {view === "MONTH" ? <MonthGrid {...shared} anchorKey={anchorKey} /> : null}
      {view === "WEEK" ? <WeekGrid {...shared} anchorKey={anchorKey} /> : null}
      {view === "DAY" ? <DayGrid {...shared} anchorKey={anchorKey} /> : null}
      {view === "AGENDA" ? (
        <AgendaList tasks={tasks} timeZone={timeZone} todayKey={todayKey} emptySlot={emptySlot} />
      ) : null}
    </div>
  );
}

type BoardProps = {
  anchorKey: DateKey;
  tasks: CalendarTask[];
  timeZone: string;
  todayKey: DateKey;
  canEdit: boolean;
  dragging: string | null;
  dropTarget: string | null;
  byDay: Map<string, CalendarTask[]>;
  beginDrag: (event: React.DragEvent, task: CalendarTask) => void;
  endDrag: () => void;
  allowDrop: (event: React.DragEvent) => void;
  overDrop: (event: React.DragEvent, dateKey: DateKey) => void;
  leaveDrop: (dateKey: DateKey) => void;
  drop: (event: React.DragEvent, dateKey: DateKey, timeKey?: string) => void;
};

// ---------------------------------------------------------------------------
// Month
// ---------------------------------------------------------------------------

function MonthGrid({
  anchorKey,
  timeZone,
  todayKey,
  canEdit,
  dragging,
  dropTarget,
  byDay,
  beginDrag,
  endDrag,
  allowDrop,
  overDrop,
  leaveDrop,
  drop,
}: BoardProps) {
  const cells = useMemo(() => monthGrid(anchorKey, timeZone), [anchorKey, timeZone]);
  const total = cells.reduce((sum, cell) => sum + (byDay.get(cell.dateKey)?.length ?? 0), 0);

  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{monthTitle(anchorKey)}</h2>
      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/40 grid grid-cols-7 border-b text-center text-xs font-medium">
          {WEEKDAY_HEADINGS.map((heading) => (
            <div key={heading} className="py-2">
              {heading}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, index) => {
            const dayTasks = byDay.get(cell.dateKey) ?? [];
            const isDrop = dropTarget === cell.dateKey;

            return (
              <div
                key={cell.dateKey}
                onDragOver={(event) => overDrop(event, cell.dateKey)}
                onDragEnter={(event) => allowDrop(event)}
                onDrop={(event) => drop(event, cell.dateKey)}
                onDragLeave={() => leaveDrop(cell.dateKey)}
                className={cn(
                  "min-h-24 space-y-1 border-r border-b p-1.5 text-xs",
                  index % 7 === 6 && "border-r-0",
                  index >= cells.length - 7 && "border-b-0",
                  !cell.inMonth && "bg-muted/20",
                  isDrop && "bg-primary/10 ring-primary ring-2 ring-inset",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-full",
                      cell.dateKey === todayKey && "bg-primary text-primary-foreground",
                      !cell.inMonth && "text-muted-foreground",
                    )}
                  >
                    {cell.dayOfMonth}
                  </span>
                  {dayTasks.length > 2 ? (
                    <span className="text-muted-foreground text-[10px]">{dayTasks.length}</span>
                  ) : null}
                </div>

                {dayTasks.slice(0, 3).map((task) => (
                  <TaskChip
                    key={task.id}
                    task={task}
                    draggable={canEdit}
                    isDragging={dragging === task.id}
                    onDragStart={beginDrag}
                    onDragEnd={endDrag}
                    compact
                  />
                ))}
                {dayTasks.length > 3 ? (
                  <p className="text-muted-foreground text-[10px]">
                    +{dayTasks.length - 3} more
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------

function WeekGrid({
  anchorKey,
  timeZone,
  todayKey,
  canEdit,
  dragging,
  dropTarget,
  byDay,
  beginDrag,
  endDrag,
  allowDrop,
  overDrop,
  drop,
}: BoardProps) {
  const days = useMemo(() => weekDateKeys(anchorKey), [anchorKey]);
  const total = days.reduce((sum, key) => sum + (byDay.get(key)?.length ?? 0), 0);

  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{weekTitle(anchorKey)}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {days.map((dateKey) => {
          const dayTasks = byDay.get(dateKey) ?? [];
          const isDrop = dropTarget === dateKey;

          return (
            <section
              key={dateKey}
              onDragOver={(event) => overDrop(event, dateKey)}
              onDragEnter={(event) => allowDrop(event)}
              onDrop={(event) => drop(event, dateKey)}
              className={cn(
                "space-y-2 rounded-lg border p-2",
                dateKey === todayKey && "border-primary/60",
                isDrop && "bg-primary/10 ring-primary ring-2 ring-inset",
              )}
            >
              <header className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {relativeDayLabel(dateKey, timeZone)}
                </h3>
                <span className="text-muted-foreground text-xs">
                  {dayTitle(dateKey).replace(/,.*$/, "")}
                </span>
              </header>

              {dayTasks.length === 0 ? (
                <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                  Nothing scheduled
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {dayTasks.map((task) => (
                    <li key={task.id}>
                      <TaskChip
                        task={task}
                        draggable={canEdit}
                        isDragging={dragging === task.id}
                        onDragStart={beginDrag}
                        onDragEnd={endDrag}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT_PX = 56;

/** Half-hour labels down the left edge of the day view. */
const DAY_HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, index) => DAY_START_HOUR + index,
);

function DayGrid({
  anchorKey,
  timeZone,
  todayKey,
  canEdit,
  dragging,
  dropTarget,
  byDay,
  beginDrag,
  endDrag,
  allowDrop,
  overDrop,
  drop,
}: BoardProps) {
  const dayTasks = byDay.get(anchorKey) ?? [];
  const isDrop = dropTarget === anchorKey;

  /**
   * Tasks are positioned by their wall time, not by an index in a list, so a
   * 09:00 task is genuinely where 09:00 falls. Anything outside the visible
   * window is clamped into it rather than hidden, so nothing disappears.
   */
  const positioned = dayTasks.map((task) => {
    const minutes = minuteOf(task.scheduledAt, task.timeZone || timeZone);
    const clamped = Math.min(
      Math.max(minutes, DAY_START_HOUR * 60),
      DAY_END_HOUR * 60 - 15,
    );

    return { task, minutes: clamped, outOfRange: minutes < DAY_START_HOUR * 60 || minutes >= DAY_END_HOUR * 60 };
  });

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{dayTitle(anchorKey)}</h2>

      {dayTasks.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          Nothing scheduled for {relativeDayLabel(anchorKey, timeZone)}.
        </p>
      ) : null}

      <div className="flex gap-2">
        <div className="w-10 shrink-0 text-right text-[10px] text-muted-foreground">
          {DAY_HOURS.map((hour) => (
            <div key={hour} style={{ height: HOUR_HEIGHT_PX }} className="relative -top-1.5">
              {String(hour % 24).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        <div
          onDragOver={(event) => overDrop(event, anchorKey)}
          onDragEnter={(event) => allowDrop(event)}
          onDrop={(event) => drop(event, anchorKey, minuteKeyFromPointer(event))}
          className={cn(
            "relative flex-1 rounded-lg border",
            isDrop && "bg-primary/10 ring-primary ring-2 ring-inset",
            anchorKey === todayKey && "border-primary/60",
          )}
          style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT_PX }}
        >
          {DAY_HOURS.slice(0, -1).map((hour) => (
            <div
              key={hour}
              className="border-t border-dashed"
              style={{ position: "absolute", top: (hour - DAY_START_HOUR) * HOUR_HEIGHT_PX, left: 0, right: 0 }}
            />
          ))}

          {positioned.map(({ task, minutes, outOfRange }) => (
            <div
              key={task.id}
              draggable={canEdit}
              onDragStart={(event) => beginDrag(event, task)}
              onDragEnd={endDrag}
              style={{ top: ((minutes - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT_PX }}
              className={cn(
                "absolute right-1 left-1 z-10",
                dragging === task.id && "opacity-40",
              )}
            >
              <TaskCard task={task} compact outOfRange={outOfRange} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The half-hour slot under the pointer, so dropping on the day view reschedules
 * to a time and not just to a date. Rounds to 15 minutes because nobody plans in
 * 7-minute increments.
 */
function minuteKeyFromPointer(event: React.DragEvent): string | undefined {
  const element = event.currentTarget;
  const bounds = element.getBoundingClientRect();
  const ratio = (event.clientY - bounds.top) / bounds.height;
  const minutes = Math.round(ratio * (DAY_END_HOUR - DAY_START_HOUR) * 60 / 15) * 15;
  const clamped = Math.min(
    Math.max(DAY_START_HOUR * 60 + minutes, 0),
    DAY_END_HOUR * 60 - 15,
  );

  const hours = String(Math.floor(clamped / 60)).padStart(2, "0");
  const rest = String(clamped % 60).padStart(2, "0");

  return `${hours}:${rest}`;
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

function AgendaList({
  tasks,
  timeZone,
  todayKey,
  emptySlot,
}: {
  tasks: CalendarTask[];
  timeZone: string;
  todayKey: DateKey;
  emptySlot: React.ReactNode;
}) {
  const grouped = useMemo(() => {
    const byDay = new Map<string, CalendarTask[]>();

    for (const task of tasks) {
      const existing = byDay.get(task.viewDateKey);
      if (existing) {
        existing.push(task);
      } else {
        byDay.set(task.viewDateKey, [task]);
      }
    }

    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  if (grouped.length === 0) {
    return <>{emptySlot}</>;
  }

  return (
    <div className="space-y-4">
      {grouped.map(([dateKey, dayTasks]) => (
        <section key={dateKey} className="space-y-2">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            {relativeDayLabel(dateKey, timeZone)}
            <span className="text-muted-foreground text-xs font-normal">
              {dayTasks.length} task{dayTasks.length === 1 ? "" : "s"}
            </span>
            {dateKey === todayKey ? <Badge variant="secondary">Today</Badge> : null}
          </h3>
          <ul className="space-y-2">
            {dayTasks.map((task) => (
              <li key={task.id}>
                <TaskCard task={task} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task rendering
// ---------------------------------------------------------------------------

function TaskChip({
  task,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  compact = false,
}: {
  task: CalendarTask;
  draggable: boolean;
  isDragging: boolean;
  onDragStart: (event: React.DragEvent, task: CalendarTask) => void;
  onDragEnd: () => void;
  compact?: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => onDragStart(event, task)}
      onDragEnd={onDragEnd}
      title={`${task.postTitle || task.copy || "Untitled post"} · ${task.profileName} · ${task.viewTimeKey}`}
      className={cn(
        "bg-background flex items-center gap-1 rounded border px-1 py-0.5 text-[11px] leading-tight",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        task.status === "OVERDUE" && "border-warning/60 bg-warning/10",
        task.status === "COMPLETED" && "opacity-60",
      )}
    >
      {draggable ? <GripVertical className="text-muted-foreground size-3 shrink-0" /> : null}
      <span className="text-muted-foreground shrink-0 tabular-nums">{task.viewTimeKey}</span>
      <span className="truncate">{task.postTitle || task.copy || "Untitled post"}</span>
      {compact && task.assignedUserName ? (
        <UserRound className="text-muted-foreground size-2.5 shrink-0" />
      ) : null}
    </div>
  );
}

function TaskCard({
  task,
  compact = false,
  outOfRange = false,
}: {
  task: CalendarTask;
  compact?: boolean;
  outOfRange?: boolean;
}) {
  const label = task.postTitle || task.copy || "Untitled post";

  return (
    <div
      className={cn(
        "bg-background space-y-1.5 rounded-md border p-2 text-xs",
        task.status === "OVERDUE" && "border-warning/60",
        task.status === "COMPLETED" && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <PlatformBadge platform={task.platform} />
        <TargetStatusBadge status={task.status} />
        <span className="text-muted-foreground flex items-center gap-1 tabular-nums">
          <Clock className="size-3" />
          {task.viewTimeKey}
        </span>
        {outOfRange ? (
          <span className="text-muted-foreground text-[10px] italic">
            outside the visible hours
          </span>
        ) : null}
      </div>

      <Link
        href={`/dashboard/posts/${task.postId}`}
        className="block truncate font-medium hover:underline"
      >
        {label}
      </Link>

      {!compact ? (
        <>
          {task.copy ? (
            <p className="text-muted-foreground line-clamp-2 text-[11px] leading-snug">
              {task.copy}
            </p>
          ) : null}
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-[10px]">
            <span>{task.profileName}</span>
            {task.assignedUserName ? (
              <span className="flex items-center gap-0.5">
                <UserRound className="size-2.5" />
                {task.assignedUserName}
              </span>
            ) : null}
            {task.timeZone ? <span>{task.timeZone}</span> : null}
          </p>
        </>
      ) : null}
    </div>
  );
}
