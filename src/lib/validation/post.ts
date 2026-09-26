import { z } from "zod";

import { PHASE2_POST_STATUSES, PHASE2_TARGET_STATUSES } from "@/lib/constants";
import { isDateKey, isTimeKey } from "@/lib/scheduling";
import { timeZoneSchema } from "@/lib/validation/schedule";

/**
 * "Unset" arrives as an omitted key from a form and as an explicit `null` from
 * the editor's serialised JSON state, so both have to normalise to `null`.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));

const title = optionalText(160);
const body = z.string().max(20000, "Content is too long.").default("");

const variantSchema = z.object({
  platform: z.enum(["FACEBOOK", "LINKEDIN"]),
  text: z.string().max(20000, "Content is too long.").default(""),
});

/**
 * A `<input type="date">` cannot produce `2026-02-30`, but the server does not
 * take the browser's word for it: the shape is matched first and then the value
 * is checked against the real calendar, so an impossible date is rejected at the
 * boundary rather than silently rolling into March.
 */
const optionalDateKey = z
  .string()
  .trim()
  .refine((value) => value === "" || isDateKey(value), "Pick a valid date.")
  .default("");

const optionalTimeKey = z
  .string()
  .trim()
  .refine((value) => value === "" || isTimeKey(value), "Pick a valid time.")
  .default("");

const reminderLeadSchema = z.coerce
  .number()
  .int("Use whole minutes.")
  .min(0, "A reminder cannot be negative.")
  .max(7 * 24 * 60, "That reminder is more than a week ahead.")
  .default(0);

const targetSchema = z
  .object({
    socialProfileId: z.string().trim().min(1, "Select a social profile."),
    assignedUserId: optionalText(64),
    scheduledDate: optionalDateKey,
    scheduledTime: optionalTimeKey,
    scheduledTimeZone: timeZoneSchema.optional(),
    reminderLeadMinutes: reminderLeadSchema,
  })
  .refine(
    (target) => Boolean(target.scheduledDate) === Boolean(target.scheduledTime),
    {
      error: "Pick both a date and a time, or neither.",
      path: ["scheduledTime"],
    },
  );

export const postSchema = z
  .object({
    title,
    content: body,
    hashtags: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((value) => parseHashtags(value ?? undefined)),
    notes: optionalText(2000),
    status: z.enum(PHASE2_POST_STATUSES).default("DRAFT"),
    assignedUserId: optionalText(64),
    variants: z.array(variantSchema).default([]),
    targets: z.array(targetSchema).default([]),
    mediaIds: z.array(z.string().trim().min(1)).default([]),
  })
  .refine(
    (value) =>
      value.title !== null ||
      value.content.trim().length > 0 ||
      value.variants.some((variant) => variant.text.trim().length > 0),
    {
      error: "Add a title or some content before saving.",
      path: ["content"],
    },
  );

export type PostInput = z.infer<typeof postSchema>;
export type PostTargetInput = z.infer<typeof targetSchema>;

/** Accepts "#tag tag2, #three" and returns ["#tag", "#tag2", "#three"]. */
export function parseHashtags(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  const seen = new Set<string>();

  for (const token of raw.split(/[\s,]+/)) {
    const cleaned = token.trim().replace(/[^#\p{L}\p{N}_]/gu, "");
    if (!cleaned || cleaned === "#") {
      continue;
    }

    seen.add(cleaned.startsWith("#") ? cleaned : `#${cleaned}`);
  }

  return [...seen];
}

export const postStatusSchema = z.object({
  status: z.enum(PHASE2_POST_STATUSES),
});

export const targetStatusSchema = z.object({
  status: z.enum(PHASE2_TARGET_STATUSES),
});

export const targetNoteSchema = z.object({
  notes: z.string().trim().max(2000, "Note is too long."),
});

export const commentSchema = z.object({
  postId: z.string().trim().min(1),
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty.")
    .max(2000, "Comment is too long."),
});

export const postFilterSchema = z.object({
  status: z.enum(PHASE2_POST_STATUSES).optional(),
  assignedUserId: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

export type PostFilter = z.infer<typeof postFilterSchema>;
