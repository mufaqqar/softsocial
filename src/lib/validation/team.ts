import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(2, "Must be at least 2 characters.")
  .max(80, "Must be 80 characters or fewer.");

const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .pipe(z.email("Enter a valid email address."))
  .transform((value) => value.toLowerCase());

const role = z.enum(["OWNER", "ADMIN", "MEMBER"]);

const status = z.enum(["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"]);

export const addMemberSchema = z.object({
  name,
  email,
  role,
  /** Required only when the email has no account yet. */
  password: z
    .string()
    .min(8, "Must be at least 8 characters.")
    .max(200)
    .regex(/[a-zA-Z]/, "Must contain at least one letter.")
    .regex(/[0-9]/, "Must contain at least one number.")
    .optional(),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({
  memberId: z.string().trim().min(1),
  name,
  role,
  status,
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const createWorkspaceSchema = z.object({
  name,
  slug: z
    .string()
    .trim()
    .min(2, "Must be at least 2 characters.")
    .max(60, "Must be 60 characters or fewer.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and dashes.",
    ),
  timezone: z.string().trim().min(1).max(64).default("Asia/Karachi"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name,
  timezone: z.string().trim().min(1, "Max 64 characters."),
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export { role as roleSchema, status as memberStatusSchema };
