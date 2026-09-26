import "server-only";

import type { ActivityAction, ActivityEntityType } from "@/generated/prisma/enums";

import { prisma } from "@/lib/db";

type ActivityInput = {
  workspaceId: string;
  userId?: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  summary: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
};

/**
 * Appends a row to the workspace activity feed. Never throws: a failed audit
 * write must not roll back the user's actual mutation.
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        metadata: (input.metadata ?? undefined) as
          | import("@/generated/prisma/client").Prisma.InputJsonValue
          | undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to record activity", error);
  }
}
