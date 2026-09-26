import { z } from "zod";

import { PLATFORMS } from "@/lib/constants";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .transform((value) => (value ? value : null));

const url = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value ? value : null))
  .refine(
    (value) => {
      if (!value) {
        return true;
      }

      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { error: "Enter a valid http(s) URL." },
  );

export const socialProfileSchema = z.object({
  platform: z.enum(PLATFORMS),
  name: z
    .string()
    .trim()
    .min(2, "Must be at least 2 characters.")
    .max(80, "Must be 80 characters or fewer."),
  profileUrl: url,
  username: optionalText(120),
  avatarUrl: url,
  description: optionalText(500),
  notes: optionalText(2000),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  assignedUserId: optionalText(64),
});

export type SocialProfileInput = z.infer<typeof socialProfileSchema>;

export const socialProfileFilterSchema = z.object({
  platform: z.enum(PLATFORMS).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  assignedUserId: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

export type SocialProfileFilter = z.infer<typeof socialProfileFilterSchema>;
