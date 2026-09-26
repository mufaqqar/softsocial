import { z } from "zod";

import { PLATFORMS } from "@/lib/constants";

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

const password = z
  .string()
  .min(8, "Must be at least 8 characters.")
  .max(200, "Must be 200 characters or fewer.")
  .regex(/[a-zA-Z]/, "Must contain at least one letter.")
  .regex(/[0-9]/, "Must contain at least one number.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name,
  email,
  password,
  workspaceName: name.optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: password,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    error: "New password must be different from the current password.",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileSchema = z.object({
  name: name,
  email: email,
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .optional()
    .refine(
      (value) => !value || (value.length >= 8 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value)),
      "Must be at least 8 characters and contain a letter and a number.",
    ),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const slugSchema = z
  .string()
  .trim()
  .min(2, "Must be at least 2 characters.")
  .max(60, "Must be 60 characters or fewer.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes.");

export const platformSchema = z.enum(PLATFORMS);

export { email as emailSchema, name as nameSchema, password as passwordSchema };
