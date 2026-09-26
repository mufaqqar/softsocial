import type { PostStatus, PostTargetStatus, SocialPlatform } from "@/generated/prisma/enums";

/** The statuses master.txt section 8 allows while creating a post. */
export const PHASE1_POST_STATUSES = [
  "DRAFT",
  "MANUAL_PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly PostStatus[];

/**
 * Phase 2 adds SCHEDULED to the post flow (master.txt 2.8) and READY-style
 * handling of the calendar. A post can still be set manually to any of these
 * except the Phase 3 publishing states, which the server rejects.
 */
export const PHASE2_POST_STATUSES = [
  "DRAFT",
  "MANUAL_PENDING",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly PostStatus[];

/** Statuses a person may set on a target by hand. OVERDUE is derived, not chosen. */
export const PHASE2_TARGET_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly PostTargetStatus[];

export const PLATFORMS = ["FACEBOOK", "LINKEDIN"] as const satisfies readonly SocialPlatform[];

export type Platform = SocialPlatform;

export const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
};

export const POST_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  MANUAL_PENDING: "Awaiting manual publishing",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  SCHEDULED: "Scheduled",
  PENDING_APPROVAL: "Pending approval",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  PROCESSING: "Processing",
  PUBLISHED: "Published",
  PARTIALLY_PUBLISHED: "Partially published",
  FAILED: "Failed",
  BLOCKED: "Blocked",
};

export const TARGET_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  OVERDUE: "Overdue",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  PUBLISHED: "Published",
  BLOCKED: "Blocked",
};

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"
  | "muted";

/** Maps a domain status to a badge variant so colours stay consistent. */
export function postStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "COMPLETED":
    case "PUBLISHED":
      return "success";
    case "IN_PROGRESS":
    case "PROCESSING":
      return "info";
    case "MANUAL_PENDING":
    case "SCHEDULED":
    case "PENDING_APPROVAL":
    case "APPROVED":
    case "QUEUED":
      return "warning";
    case "CANCELLED":
    case "REJECTED":
    case "BLOCKED":
      return "muted";
    case "FAILED":
      return "destructive";
    default:
      return "secondary";
  }
}

export function targetStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "COMPLETED":
    case "PUBLISHED":
      return "success";
    case "IN_PROGRESS":
    case "PROCESSING":
      return "info";
    case "FAILED":
      return "destructive";
    case "OVERDUE":
      return "warning";
    case "CANCELLED":
    case "BLOCKED":
      return "muted";
    default:
      return "secondary";
  }
}

export function profileStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INACTIVE":
      return "warning";
    case "ARCHIVED":
    case "DISCONNECTED":
      return "muted";
    case "REAUTH_REQUIRED":
    case "ERROR":
      return "destructive";
    default:
      return "secondary";
  }
}

export const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export const DEFAULT_TIMEZONE = "Asia/Karachi";

/** Calendar views from master.txt 2.1. */
export const CALENDAR_VIEWS = ["MONTH", "WEEK", "DAY", "AGENDA"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  MONTH: "Month",
  WEEK: "Week",
  DAY: "Day",
  AGENDA: "Agenda",
};

/** How far ahead the agenda view lists scheduled work. */
export const AGENDA_DAYS = 30;

/** Minutes before `scheduledAt` that the in-app reminder fires. 0 means no reminder. */
export const REMINDER_LEAD_MINUTES = [
  0, 5, 10, 15, 30, 60, 120, 1440,
] as const;

export const REMINDER_LEAD_LABELS: Record<number, string> = {
  0: "No reminder",
  5: "5 minutes before",
  10: "10 minutes before",
  15: "15 minutes before",
  30: "30 minutes before",
  60: "1 hour before",
  120: "2 hours before",
  1440: "1 day before",
};

export function reminderLeadLabel(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) {
    return "No reminder";
  }

  return REMINDER_LEAD_LABELS[minutes] ?? `${minutes} minutes before`;
}

/** Target statuses the calendar and task filters can narrow by. */
export const SCHEDULE_FILTER_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "OVERDUE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type ScheduleFilterStatus = (typeof SCHEDULE_FILTER_STATUSES)[number];
