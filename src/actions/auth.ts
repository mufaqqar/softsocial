"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  SESSION_TTL_MS,
  createSessionCookie,
  decryptSession,
  deleteSessionCookie,
} from "@/lib/auth/session";
import { setActiveWorkspace } from "@/lib/auth/dal";
import { recordActivity } from "@/lib/activity";
import { formError, type FormState } from "@/lib/form-state";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@/lib/validation/auth";
import { createWorkspaceSchema } from "@/lib/validation/team";
import { slugify } from "@/lib/slug";

function formToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function clientIp() {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    null
  );
}

/** Shared by login and register: issues a Session row and the signed cookie. */
async function startSession(userId: string) {
  const headerList = await headers();

  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: headerList.get("user-agent"),
      ipAddress: await clientIp(),
    },
    select: { id: true },
  });

  await createSessionCookie(session.id, userId);
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse(formToObject(formData));

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const input: LoginInput = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, status: true },
  });

  // Always run a verification so a missing account and a wrong password take a
  // similar amount of time.
  const valid = await verifyPassword(
    input.password,
    user?.passwordHash ?? "scrypt$00$00",
  );

  if (!user || !valid) {
    return { error: "Incorrect email or password." };
  }

  if (user.status !== "ACTIVE") {
    return {
      error:
        user.status === "SUSPENDED"
          ? "This account is suspended. Contact your workspace owner."
          : "This account has been deactivated.",
    };
  }

  await startSession(user.id);
  redirect("/dashboard");
}

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formToObject(formData);
  const parsed = registerSchema.safeParse(raw);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const input: RegisterInput = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    return { fieldErrors: { email: ["An account with this email already exists."] } };
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
    },
    select: { id: true },
  });

  if (input.workspaceName) {
    const slug = await uniqueWorkspaceSlug(slugify(input.workspaceName));
    const workspace = await prisma.workspace.create({
      data: {
        name: input.workspaceName,
        slug,
        members: { create: { userId: user.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() } },
        settings: { create: {} },
      },
      select: { id: true },
    });

    await setActiveWorkspace(workspace.id);
    await recordActivity({
      workspaceId: workspace.id,
      userId: user.id,
      action: "WORKSPACE_CREATED",
      entityType: "WORKSPACE",
      entityId: workspace.id,
      summary: `${input.name} created the workspace "${input.workspaceName}"`,
    });
  }

  await startSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get("softsocial.session")?.value;

  if (token) {
    const payload = await decryptSession(token);

    if (payload) {
      await prisma.session.updateMany({
        where: { id: payload.sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  await deleteSessionCookie();
  redirect("/login");
}

/** Used by the onboarding page and Settings. */
export async function createWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { requireSession } = await import("@/lib/auth/dal");
  const session = await requireSession();

  const raw = formToObject(formData);

  // The slug is optional on the form: derive it from the workspace name.
  if (!String(raw.slug ?? "").trim()) {
    raw.slug = slugify(String(raw.name ?? ""));
  }

  const parsed = createWorkspaceSchema.safeParse(raw);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const input = parsed.data;
  const slug = await uniqueWorkspaceSlug(slugify(input.name), input.slug);

  try {
    const workspace = await prisma.workspace.create({
      data: {
        name: input.name,
        slug,
        timezone: input.timezone,
        members: {
          create: {
            userId: session.user.id,
            role: "OWNER",
            status: "ACTIVE",
            joinedAt: new Date(),
            invitedById: session.user.id,
          },
        },
        settings: { create: { defaultTimezone: input.timezone } },
      },
      select: { id: true },
    });

    await setActiveWorkspace(workspace.id);
    await recordActivity({
      workspaceId: workspace.id,
      userId: session.user.id,
      action: "WORKSPACE_CREATED",
      entityType: "WORKSPACE",
      entityId: workspace.id,
      summary: `${session.user.name} created the workspace "${input.name}"`,
    });
  } catch (error) {
    return formError(error);
  }

  redirect("/dashboard");
}

/** Appends -1, -2 ... until the slug is free. */
async function uniqueWorkspaceSlug(base: string, requested?: string): Promise<string> {
  const seed = requested || base || "workspace";
  let candidate = seed;

  for (let attempt = 2; attempt < 50; attempt += 1) {
    const existing = await prisma.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${seed}-${attempt}`;
  }

  return `${seed}-${Date.now()}`;
}
