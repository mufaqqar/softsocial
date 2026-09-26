/**
 * Phase 2 scheduling primitives (master.txt section 2).
 *
 * Everything here is pure and runs on the server *and* the client, because the
 * calendar renders in the browser while its rows come from the server. The
 * module deliberately knows nothing about Prisma: it only converts between the
 * three representations a schedule passes through.
 *
 *   wall date  "2026-09-30"   the day a human sees in the workspace timezone
 *   wall time  "10:00"        the time of day a human types
 *   instant    Date           the UTC timestamp stored in `PostTarget.scheduledAt`
 *
 * A schedule is only ever meaningful relative to an IANA timezone, so every
 * function that crosses the wall-date/instant boundary takes one.
 *
 * Wall dates are carried in `Date` objects pinned to UTC midnight. All of that
 * arithmetic goes through the `*UTC` accessors on purpose: `date-fns` operates
 * in the host timezone, so using it here would make the calendar shift by a day
 * on a machine that is not on UTC. Instants are the only thing ever formatted in
 * a real timezone, and only via `date-fns-tz`.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { PostTargetStatus } from "@/generated/prisma/enums";

/** `YYYY-MM-DD`. */
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** `HH:mm`, 24-hour clock. */
export const TIME_KEY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type DateKey = string;
export type TimeKey = string;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_LENGTH = 7;
const MONTH_GRID_WEEKS = 6;

export function isDateKey(value: unknown): value is DateKey {
  return typeof value === "string" && DATE_KEY_PATTERN.test(value) && isRealDateKey(value);
}

export function isTimeKey(value: unknown): value is TimeKey {
  return typeof value === "string" && TIME_KEY_PATTERN.test(value);
}

function isRealDateKey(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * A `Date` pinned to UTC midnight that exists only to carry calendar fields. It
 * is never an instant and is never returned to callers; `toDateKey` turns it
 * back into the string a human reads.
 */
function wallDate(dateKey: DateKey): Date {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];

  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date): DateKey {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Adds whole days to a wall date, staying on UTC midnight. */
function addWallDays(dateKey: DateKey, days: number): DateKey {
  return toDateKey(new Date(wallDate(dateKey).getTime() + days * MS_PER_DAY));
}

/** Whole days from `fromKey` to `toKey`; negative when `toKey` is earlier. */
export function daysBetween(fromKey: DateKey, toKey: DateKey): number {
  return Math.round((wallDate(toKey).getTime() - wallDate(fromKey).getTime()) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Instant <-> wall clock, always through an IANA timezone
// ---------------------------------------------------------------------------

/** The current wall date in `timeZone`. */
export function todayKey(now: Date = new Date(), timeZone: string): DateKey {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

/** The wall date an instant falls on, as seen in `timeZone`. */
export function dateKeyOf(instant: Date, timeZone: string): DateKey {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

/** The wall time of day an instant falls on, as seen in `timeZone`. */
export function timeKeyOf(instant: Date, timeZone: string): TimeKey {
  return formatInTimeZone(instant, timeZone, "HH:mm");
}

/** Minutes since wall midnight in `timeZone`, used to lay out the day views. */
export function minuteOf(instant: Date, timeZone: string): number {
  const [hours = "0", minutes = "0"] = formatInTimeZone(instant, timeZone, "HH:mm").split(
    ":",
  );

  return Number(hours) * 60 + Number(minutes);
}

/** The inverse of {@link minuteOf}: a minute-of-day back to a `HH:mm` key. */
export function minuteToTimeKey(minutes: number): TimeKey {
  const clamped = Math.min(WEEK_LENGTH * 24 * 60 - 1, Math.max(0, Math.trunc(minutes)));
  const hours = String(Math.floor(clamped / 60)).padStart(2, "0");
  const rest = String(clamped % 60).padStart(2, "0");

  return `${hours}:${rest}`;
}

/**
 * Turns a wall date and wall time in `timeZone` into the UTC instant to store.
 *
 * During a spring-forward gap the wall time does not exist; `fromZonedTime`
 * resolves it forward, which keeps a dragged target on the day the user dropped
 * it rather than silently jumping back 24 hours.
 */
export function toZonedInstant(
  dateKey: DateKey,
  timeKey: TimeKey,
  timeZone: string,
): Date | null {
  if (!isDateKey(dateKey) || !isTimeKey(timeKey)) {
    return null;
  }

  const instant = fromZonedTime(`${dateKey}T${timeKey}:00`, timeZone);

  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** Half-open `[from, to)` instant range covering one whole wall day. */
export function zonedDayRange(dateKey: DateKey, timeZone: string): { from: Date; to: Date } {
  return {
    from: fromZonedTime(`${dateKey}T00:00:00`, timeZone),
    to: fromZonedTime(`${addWallDays(dateKey, 1)}T00:00:00`, timeZone),
  };
}

// ---------------------------------------------------------------------------
// Grids
// ---------------------------------------------------------------------------

/** Inclusive wall-date keys for a span. */
export function dateKeyRange(startKey: DateKey, days: number): DateKey[] {
  const total = Math.max(1, Math.trunc(days));

  return Array.from({ length: total }, (_, index) => addWallDays(startKey, index));
}

export type CalendarCell = {
  /** `YYYY-MM-DD` for the cell. */
  dateKey: DateKey;
  /** Day of the month, 1-31. */
  dayOfMonth: number;
  /** False for the leading/trailing days shown to pad the month grid. */
  inMonth: boolean;
  isToday: boolean;
};

/** The Monday on or before `dateKey`. */
function startOfWeekKey(dateKey: DateKey): DateKey {
  // getUTCDay() is 0 for Sunday, so shift it to a Monday-first 0-6 index.
  const weekday = wallDate(dateKey).getUTCDay();
  const offset = (weekday + 6) % 7;

  return addWallDays(dateKey, -offset);
}

/**
 * A fixed six-week month grid starting on Monday. The height is fixed so the
 * grid does not jump between months, which matters when its cells are the drop
 * targets for rescheduling.
 */
export function monthGrid(
  anchorKey: DateKey,
  timeZone: string,
  now: Date = new Date(),
): CalendarCell[] {
  const anchor = wallDate(anchorKey);
  const firstOfMonth = toDateKey(
    new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)),
  );
  const gridStart = startOfWeekKey(firstOfMonth);
  const today = todayKey(now, timeZone);

  return Array.from({ length: MONTH_GRID_WEEKS * WEEK_LENGTH }, (_, index) => {
    const dateKey = addWallDays(gridStart, index);
    const month = Number(dateKey.slice(5, 7)) - 1;

    return {
      dateKey,
      dayOfMonth: Number(dateKey.slice(8, 10)),
      inMonth: month === anchor.getUTCMonth(),
      isToday: dateKey === today,
    };
  });
}

/** The seven wall dates of the week containing `anchorKey`, Monday first. */
export function weekDateKeys(anchorKey: DateKey): DateKey[] {
  const start = startOfWeekKey(anchorKey);

  return Array.from({ length: WEEK_LENGTH }, (_, index) => addWallDays(start, index));
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Steps the anchor by whole days, forwards or backwards. */
export function shiftDay(anchorKey: DateKey, delta: number): DateKey {
  return addWallDays(anchorKey, delta);
}

/** Steps the anchor by whole weeks. */
export function shiftWeek(anchorKey: DateKey, delta: number): DateKey {
  return addWallDays(anchorKey, delta * WEEK_LENGTH);
}

/** Steps the anchor by whole months, clamping the day to the shorter month. */
export function shiftMonth(anchorKey: DateKey, delta: number): DateKey {
  const anchor = wallDate(anchorKey);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + delta;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return toDateKey(new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay))));
}

const titleFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" });

export function monthTitle(anchorKey: DateKey): string {
  return titleFormat({ month: "long", year: "numeric" }).format(wallDate(anchorKey));
}

export function weekTitle(anchorKey: DateKey): string {
  const days = weekDateKeys(anchorKey);
  const startKey = days[0]!;
  const endKey = days[days.length - 1]!;
  const start = wallDate(startKey);
  const end = wallDate(endKey);
  const month = titleFormat({ month: "short" });
  const day = titleFormat({ day: "numeric" });
  const year = titleFormat({ year: "numeric" });

  // The month is only repeated on the right when the week actually crosses one.
  const right =
    startKey.slice(0, 7) === endKey.slice(0, 7)
      ? `${day.format(end)}, ${year.format(end)}`
      : `${month.format(end)} ${day.format(end)}, ${year.format(end)}`;

  return `${month.format(start)} ${day.format(start)} – ${right}`;
}

/** "Today" / "Tomorrow" / "Yesterday" when it helps, otherwise a short date. */
export function relativeDayLabel(
  dateKey: DateKey,
  timeZone: string,
  now: Date = new Date(),
): string {
  const diff = daysBetween(todayKey(now, timeZone), dateKey);

  if (diff === 0) {
    return "Today";
  }

  if (diff === 1) {
    return "Tomorrow";
  }

  if (diff === -1) {
    return "Yesterday";
  }

  return titleFormat({ weekday: "short", month: "short", day: "numeric" }).format(
    wallDate(dateKey),
  );
}

/**
 * The wall dates a calendar view needs rows for, plus the half-open instant
 * range that covers them in `timeZone`. The range runs to the end of the last
 * day, so a 23:30 post on the final cell is still returned.
 */
export function viewRange(
  view: "MONTH" | "WEEK" | "DAY" | "AGENDA",
  anchorKey: DateKey,
  timeZone: string,
  agendaDays: number,
): { keys: DateKey[]; from: Date; to: Date } {
  const keys =
    view === "MONTH"
      ? monthGrid(anchorKey, timeZone).map((cell) => cell.dateKey)
      : view === "WEEK"
        ? weekDateKeys(anchorKey)
        : view === "DAY"
          ? [anchorKey]
          : dateKeyRange(anchorKey, agendaDays);

  const first = keys[0]!;
  const last = keys[keys.length - 1]!;

  return { keys, from: zonedDayRange(first, timeZone).from, to: zonedDayRange(last, timeZone).to };
}

export function dayTitle(anchorKey: DateKey): string {
  return titleFormat({
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(wallDate(anchorKey));
}

// ---------------------------------------------------------------------------
// Status, reminders, labels
// ---------------------------------------------------------------------------

/**
 * master.txt 2.8: a target whose `scheduledAt` has passed while it is still
 * PENDING reads as OVERDUE. The value is derived rather than read from the row,
 * so the calendar is correct the moment the clock passes instead of waiting for
 * a background job to write the flag.
 */
export function effectiveTargetStatus(
  status: PostTargetStatus,
  scheduledAt: Date | null | undefined,
  now: Date = new Date(),
): PostTargetStatus {
  if (status === "PENDING" && scheduledAt && scheduledAt.getTime() <= now.getTime()) {
    return "OVERDUE";
  }

  return status;
}

export function isOverdue(
  status: PostTargetStatus,
  scheduledAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return effectiveTargetStatus(status, scheduledAt, now) === "OVERDUE";
}

/** The reminder instant for a schedule, or null when no reminder was asked for. */
export function deriveReminderAt(
  scheduledAt: Date | null | undefined,
  leadMinutes: number,
): Date | null {
  if (!scheduledAt || !Number.isFinite(leadMinutes) || leadMinutes <= 0) {
    return null;
  }

  return new Date(scheduledAt.getTime() - leadMinutes * 60_000);
}

/** Minutes from now to an instant; negative once it is in the past. */
export function minutesUntil(instant: Date, now: Date = new Date()): number {
  return Math.round((instant.getTime() - now.getTime()) / 60_000);
}

/** "in 15 minutes" / "12 minutes ago" / "now", for reminder copy. */
export function relativeMinutesLabel(minutes: number): string {
  if (Math.abs(minutes) < 1) {
    return "now";
  }

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }

  if (Math.abs(minutes) < 60 * 24) {
    return formatter.format(Math.round(minutes / 60), "hour");
  }

  return formatter.format(Math.round(minutes / (60 * 24)), "day");
}
