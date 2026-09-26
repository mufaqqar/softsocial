import { Badge } from "@/components/ui/badge";
import {
  PLATFORM_LABELS,
  POST_STATUS_LABELS,
  TARGET_STATUS_LABELS,
  postStatusVariant,
  profileStatusVariant,
  targetStatusVariant,
  type BadgeVariant,
} from "@/lib/constants";

const PROFILE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ARCHIVED: "Archived",
  DISCONNECTED: "Disconnected",
  REAUTH_REQUIRED: "Reconnect required",
  ERROR: "Error",
};

export function PostStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={postStatusVariant(status)}>{POST_STATUS_LABELS[status] ?? status}</Badge>
  );
}

export function TargetStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={targetStatusVariant(status)}>{TARGET_STATUS_LABELS[status] ?? status}</Badge>
  );
}

export function ProfileStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={profileStatusVariant(status)}>
      {PROFILE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function PlatformBadge({ platform }: { platform: string }) {
  return <Badge variant="outline">{PLATFORM_LABELS[platform as never] ?? platform}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  const variant: BadgeVariant = role === "OWNER" ? "default" : role === "ADMIN" ? "info" : "secondary";
  return <Badge variant={variant}>{role.charAt(0) + role.slice(1).toLowerCase()}</Badge>;
}

export function MemberStatusBadge({ status }: { status: string }) {
  const variant: BadgeVariant =
    status === "ACTIVE"
      ? "success"
      : status === "INVITED"
        ? "warning"
        : status === "SUSPENDED"
          ? "destructive"
          : "muted";

  return (
    <Badge variant={variant}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
  );
}
