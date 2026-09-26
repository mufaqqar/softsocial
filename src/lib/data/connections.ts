import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import { decryptSecret, maskSecret } from "@/lib/crypto/token-crypto";
import { configurationReport } from "@/lib/publishing/env";
import type { ConnectionStatus, SocialProviderName } from "@/generated/prisma/enums";

/**
 * master.txt 3.15. Read models for the Connections, Publishing History and API
 * Status screens.
 *
 * `maskSecret` is used for the token column so the encrypted blob never reaches
 * a component. It takes the decrypted value, which means the Connections screen
 * decrypts in order to show the last four characters — acceptable because that
 * value is already in this process's memory for the duration of the request, and
 * it is never serialised beyond the four characters.
 */

export type ConnectionRow = {
  id: string;
  provider: SocialProviderName;
  providerAccountId: string;
  displayName: string;
  avatarUrl: string | null;
  status: ConnectionStatus;
  /** Last four characters of the token only. */
  tokenHint: string;
  tokenExpiresAt: Date | null;
  scopes: string[];
  linkedProfileCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  connectedByUserName: string;
  hasRefreshToken: boolean;
};

export async function listConnections(): Promise<ConnectionRow[]> {
  const { workspace } = await requireWorkspace();

  const connections = await prisma.socialConnection.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ status: "asc" }, { provider: "asc" }, { displayName: "asc" }],
    include: {
      connectedByUser: { select: { name: true } },
      _count: { select: { profiles: true } },
    },
  });

  return connections.map((connection) => {
    let tokenHint = "—";

    // Decryption failures must not break the page; the connection is still
    // listed so an administrator can delete or reconnect it.
    try {
      tokenHint = maskSecret(
        connection.accessTokenEncrypted ? decryptSecret(connection.accessTokenEncrypted) : null,
      );
    } catch {
      tokenHint = "unreadable";
    }

    return {
      id: connection.id,
      provider: connection.provider,
      providerAccountId: connection.providerAccountId,
      displayName: connection.displayName,
      avatarUrl: connection.avatarUrl,
      status: connection.status,
      tokenHint,
      tokenExpiresAt: connection.tokenExpiresAt,
      scopes: connection.scopes,
      linkedProfileCount: connection._count.profiles,
      lastUsedAt: connection.lastUsedAt,
      createdAt: connection.createdAt,
      connectedByUserName: connection.connectedByUser.name,
      hasRefreshToken: connection.refreshTokenEncrypted !== null,
    };
  });
}

export type PublishAttemptRow = {
  id: string;
  postId: string;
  /** The id Retry re-arms. */
  postTargetId: string;
  postTitle: string | null;
  profileName: string;
  platform: string;
  attempt: number;
  result: string;
  errorCode: string | null;
  errorMessage: string | null;
  providerPostId: string | null;
  providerUrl: string | null;
  createdAt: Date;
};

export type PublishHistoryFilter = {
  result?: "SUCCESS" | "FAILURE" | undefined;
  platform?: string | undefined;
  take?: number;
};

export const listPublishAttempts = cache(async (filter: PublishHistoryFilter = {}) => {
  const { workspace } = await requireWorkspace();

  const attempts = await prisma.publishAttempt.findMany({
    where: {
      workspaceId: workspace.id,
      ...(filter.result ? { result: filter.result } : {}),
      ...(filter.platform ? { platform: filter.platform as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.take ?? 100, 500),
    // PublishAttempt reaches the profile through its target, and the live
    // permalink through PostTarget.providerUrl.
    include: {
      post: { select: { id: true, title: true } },
      postTarget: { select: { socialProfileId: true, providerUrl: true } },
    },
  });

  const profileIds = [...new Set(attempts.map((attempt) => attempt.postTarget.socialProfileId))];
  const profiles = profileIds.length
    ? await prisma.socialProfile.findMany({
        where: { id: { in: profileIds } },
        select: { id: true, name: true },
      })
    : [];
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name]));

  const rows: PublishAttemptRow[] = attempts.map((attempt) => ({
    id: attempt.id,
    postId: attempt.postId,
    postTargetId: attempt.postTargetId,
    postTitle: attempt.post.title,
    profileName: profileNames.get(attempt.postTarget.socialProfileId) ?? "Removed profile",
    platform: attempt.platform,
    attempt: attempt.attempt,
    result: attempt.result,
    errorCode: attempt.errorCode,
    errorMessage: attempt.errorMessage,
    providerPostId: attempt.providerPostId,
    providerUrl: attempt.postTarget.providerUrl,
    createdAt: attempt.createdAt,
  }));

  return { rows, total: rows.length };
});

export type ApiStatusReport = {
  provider: string;
  configured: boolean;
  missing: string[];
  notes: string[];
  connectionCount: number;
  activeConnectionCount: number;
  reauthRequiredCount: number;
  lastUsedAt: Date | null;
};

/**
 * master.txt 3.15. What is configured, what is connected, and what needs a human
 * — with no secret values. `notes` carries the reason something is unusable, so
 * the screen can explain rather than merely report.
 */
export const getApiStatus = cache(async (): Promise<ApiStatusReport[]> => {
  const { workspace } = await requireWorkspace();
  const configured = configurationReport();

  const connections = await prisma.socialConnection.findMany({
    where: { workspaceId: workspace.id },
    select: {
      provider: true,
      status: true,
      lastUsedAt: true,
    },
  });

  return configured.map((report) => {
    const forProvider = connections.filter(
      (connection) => connection.provider === report.provider,
    );

    return {
      provider: report.provider,
      configured: report.configured,
      missing: report.missing,
      notes: report.notes,
      connectionCount: forProvider.length,
      activeConnectionCount: forProvider.filter((connection) => connection.status === "ACTIVE").length,
      reauthRequiredCount: forProvider.filter(
        (connection) => connection.status === "REAUTH_REQUIRED",
      ).length,
      lastUsedAt:
        forProvider
          .map((connection) => connection.lastUsedAt)
          .filter((value): value is Date => value !== null)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    };
  });
});
