import type { WorkspaceRole } from "@/generated/prisma/enums";

/**
 * Granular permission keys. Phase 1 maps the three roles from master.txt onto
 * these; later phases (approvals, publishing) add keys here without touching
 * the call sites.
 */
export const PERMISSIONS = {
  workspaceRead: "workspace:read",
  workspaceManage: "workspace:manage",
  teamRead: "team:read",
  teamManage: "team:manage",
  profileRead: "profile:read",
  profileManage: "profile:manage",
  postRead: "post:read",
  postManage: "post:manage",
  postComment: "post:comment",
  targetUpdate: "target:update",
  targetUpdateAny: "target:update-any",
  mediaRead: "media:read",
  mediaManage: "media:manage",
  activityRead: "activity:read",
  // Phase 3. Connection and publishing keys are separate on purpose: seeing that
  // a connection needs attention is read access, while replacing a credential or
  // forcing a publish is a write that can put content on a public page.
  connectionRead: "connection:read",
  connectionManage: "connection:manage",
  publishRead: "publish:read",
  publishExecute: "publish:execute",
  publishRetry: "publish:retry",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL: readonly Permission[] = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: [
    PERMISSIONS.workspaceRead,
    PERMISSIONS.teamRead,
    PERMISSIONS.teamManage,
    PERMISSIONS.profileRead,
    PERMISSIONS.profileManage,
    PERMISSIONS.postRead,
    PERMISSIONS.postManage,
    PERMISSIONS.postComment,
    PERMISSIONS.targetUpdate,
    PERMISSIONS.targetUpdateAny,
    PERMISSIONS.mediaRead,
    PERMISSIONS.mediaManage,
    PERMISSIONS.activityRead,
    PERMISSIONS.connectionRead,
    PERMISSIONS.connectionManage,
    PERMISSIONS.publishRead,
    PERMISSIONS.publishExecute,
    PERMISSIONS.publishRetry,
  ],
  // A member publishes by hand: they can read everything in the workspace, work
  // their own targets, and comment. They cannot create or reassign anything.
  //
  // Phase 3: members also get read access to connections and publish history, so
  // they can see why a post did or did not go out and tell an admin when a
  // reconnect is needed. They cannot connect an account or force a retry, since
  // both result in content appearing on a public page.
  MEMBER: [
    PERMISSIONS.workspaceRead,
    PERMISSIONS.teamRead,
    PERMISSIONS.profileRead,
    PERMISSIONS.postRead,
    PERMISSIONS.postComment,
    PERMISSIONS.targetUpdate,
    PERMISSIONS.mediaRead,
    PERMISSIONS.connectionRead,
    PERMISSIONS.publishRead,
  ],
};

export function permissionsFor(role: WorkspaceRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(
  permissions: readonly Permission[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export const ASSIGNABLE_ROLES: readonly WorkspaceRole[] = ["ADMIN", "MEMBER"];

export function isAtLeast(role: WorkspaceRole, minimum: WorkspaceRole) {
  const rank: Record<WorkspaceRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

  return rank[role] >= rank[minimum];
}
