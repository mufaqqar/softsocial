import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  type Permission,
  can,
  permissionsFor,
} from "@/lib/auth/permissions";
import { SESSION_COOKIE_NAME, readSessionCookie } from "@/lib/auth/session";
import { WORKSPACE_COOKIE } from "@/lib/auth/constants";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: import("@/generated/prisma/enums").WorkspaceRole;
};

/** The authenticated user plus the workspaces they belong to. `null` when signed out. */
export const getSession = cache(async (): Promise<{
  user: SessionUser;
  sessionId: string;
  workspaces: WorkspaceSummary[];
} | null> => {
  const payload = await readSessionCookie();

  if (!payload) {
    return null;
  }

  const session = await prisma.session.findFirst({
    where: {
      id: payload.sid,
      userId: payload.uid,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      status: true,
      memberships: {
        where: { status: "ACTIVE", workspace: { deletedAt: null } },
        select: {
          role: true,
          workspace: {
            select: { id: true, name: true, slug: true, timezone: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user || user.status !== "ACTIVE") {
    return null;
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    sessionId: session.id,
    workspaces: user.memberships.map((membership) => ({
      ...membership.workspace,
      role: membership.role,
    })),
  };
});

/** Like `getSession` but redirects to /login when signed out. */
export const requireSession = cache(async () => {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
});

export type AuthContext = {
  user: SessionUser;
  workspace: WorkspaceSummary;
  permissions: readonly Permission[];
};

/**
 * Resolves the active workspace for the signed-in user and returns an auth
 * context. Every data function in the DAL takes this `workspace.id` and filters
 * on it, so one workspace's rows can never leak into another's request.
 */
export const requireWorkspace = cache(async (): Promise<AuthContext> => {
  const session = await requireSession();
  const cookieStore = await cookies();
  const preferred = cookieStore.get(WORKSPACE_COOKIE)?.value;

  const workspace =
    session.workspaces.find((candidate) => candidate.id === preferred) ??
    session.workspaces[0];

  if (!workspace) {
    redirect("/onboarding");
  }

  return {
    user: session.user,
    workspace,
    permissions: permissionsFor(workspace.role),
  };
});

/**
 * Authorisation guard for Server Actions. Server Actions are reachable by direct
 * POST, so every mutation calls this before touching the database.
 */
export async function assertPermission(permission: Permission): Promise<AuthContext> {
  const context = await requireWorkspace();

  if (!can(context.permissions, permission)) {
    throw new AuthorizationError();
  }

  return context;
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export { WORKSPACE_COOKIE, SESSION_COOKIE_NAME };
