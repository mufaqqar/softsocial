import { z } from "zod";

import { CALENDAR_VIEWS, SCHEDULE_FILTER_STATUSES } from "@/lib/constants";
import { isDateKey, isTimeKey } from "@/lib/scheduling";

/**
 * Phase 2 inputs (master.txt 2.2-2.5). A schedule is always a wall date plus a
 * wall time plus the IANA timezone they were typed in, so the three travel
 * together and are validated together. `0` lead minutes means "no reminder",
 * which is why it is allowed through `deriveReminderAt` as a null.
 */

const MAX_REMINDER_LEAD_MINUTES = 7 * 24 * 60;

export const dateKeySchema = z
  .string()
  .trim()
  .refine(isDateKey, { error: "Use a real YYYY-MM-DD date." });

export const timeKeySchema = z
  .string()
  .trim()
  .refine(isTimeKey, { error: "Use a 24-hour HH:mm time." });

/**
 * A zone name, never an offset. Node's `Intl` happily accepts `"+05:00"`, but an
 * offset is not a zone: it has no daylight saving, so a schedule pinned to one
 * would drift by an hour twice a year. Only `Area/Location` names and `UTC` are
 * accepted, and the name is then confirmed against the runtime.
 */
const ZONE_NAME_PATTERN = /^([A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+|UTC)$/;

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1, "Choose a timezone.")
  .max(64)
  .refine((value) => ZONE_NAME_PATTERN.test(value), {
    error: "Use a timezone name such as Asia/Karachi, not a UTC offset.",
  })
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { error: "That is not a recognised timezone." },
  );

const targetIdSchema = z.string().trim().min(1, "Missing task.");

const optionalId = z
  .string()
  .trim()
  .max(64)
  .nullish()
  .transform((value) => (value ? value : null));

const reminderLeadSchema = z.coerce
  .number()
  .int("Use whole minutes.")
  .min(0, "A reminder cannot be negative.")
  .max(MAX_REMINDER_LEAD_MINUTES, "That reminder is more than a week ahead.")
  .default(0);

/** The calendar dialog and the post editor both resolve to this shape. */
export const scheduleTargetSchema = z.object({
  targetId: targetIdSchema,
  date: dateKeySchema,
  time: timeKeySchema,
  timeZone: timeZoneSchema,
  assignedUserId: optionalId,
  reminderLeadMinutes: reminderLeadSchema,
});

/** Drag and drop sends an already-resolved instant plus the zone it is shown in. */
export const moveTargetSchema = z.object({
  targetId: targetIdSchema,
  date: dateKeySchema,
  time: timeKeySchema,
  timeZone: timeZoneSchema,
  assignedUserId: optionalId,
});

export const unscheduleTargetSchema = z.object({
  targetId: targetIdSchema,
});

export const reassignTargetSchema = z.object({
  targetId: targetIdSchema,
  assignedUserId: optionalId,
});

export const calendarFilterSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).default("MONTH"),
  /** Wall date the view is centred on, `YYYY-MM-DD` in the workspace timezone. */
  date: dateKeySchema.optional(),
  assignedUserId: optionalId,
  platform: z.enum(["FACEBOOK", "LINKEDIN"]).optional(),
  socialProfileId: optionalId,
  status: z.enum(SCHEDULE_FILTER_STATUSES).optional(),
});

export type CalendarFilter = z.infer<typeof calendarFilterSchema>;

export const tasksFilterSchema = z.object({
  /** Defaults to today in the workspace timezone. */
  date: dateKeySchema.optional(),
  assignedUserId: optionalId,
  platform: z.enum(["FACEBOOK", "LINKEDIN"]).optional(),
  /** When false (the default) only unfinished work is listed. */
  includeCompleted: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export type TasksFilter = z.infer<typeof tasksFilterSchema>;
