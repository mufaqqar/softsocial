"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireWorkspace, assertPermission } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { encryptSecret } from "@/lib/crypto/token-crypto";
import { isProviderConfigured, providerCredentials } from "@/lib/publishing/env";
import {
  authorizationUrl,
  createCodeVerifier,
  createState,
  discoverProfiles,
  exchangeCode,
  type Provider,
} from "@/lib/publishing/oauth";
import type { SocialProviderName } from "@/generated/prisma/enums";

/**
 * master.txt 3.5 and 3.6. The OAuth state row is created before the redirect and
 * consumed on the way back, which is both the CSRF defence and where the PKCE
 * verifier for LinkedIn is kept between the two hops.
 */

const STATE_TTL_MS = 10 * 60_000;

function providerFor(platform: string): Provider | null {
  if (platform === "FACEBOOK" || platform === "META") return "META";
  if (platform === "LINKEDIN") return "LINKEDIN";

  return null;
}

export type BeginConnectResult = { url: string } | { error: string };

/**
 * Returns the provider's authorization URL rather than redirecting to it.
 *
 * Leaving the app for an external provider is a full navigation, not a client
 * transition, so the caller assigns `window.location` to the returned URL. That
 * also keeps the type safe: `redirect()` from `next/navigation` only accepts
 * internal routes.
 */
export async function beginConnectAction(platform: string): Promise<BeginConnectResult> {
  const { workspace, user } = await requireWorkspace();
  await assertPermission(PERMISSIONS.connectionManage);

  const provider = providerFor(platform);

  if (!provider) {
    return { error: `${platform} is not a supported provider.` };
  }

  if (!isProviderConfigured(provider)) {
    return {
      error:
        provider === "META"
          ? "Set META_APP_ID and META_APP_SECRET before connecting Facebook."
          : "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET before connecting LinkedIn.",
    };
  }

  const { appId } = providerCredentials(provider);
  const state = createState();
  // LinkedIn requires PKCE; Meta does not, but storing a verifier costs nothing
  // and keeps the state row shape identical for both.
  const codeVerifier = createCodeVerifier();

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");

  if (!appUrl) {
    return {
      error: "APP_URL is not set, so there is no absolute callback URL to send to the provider.",
    };
  }

  await prisma.oAuthState.create({
    data: {
      state,
      workspaceId: workspace.id,
      userId: user.id,
      provider: provider as SocialProviderName,
      codeVerifier,
      redirectTo: "/dashboard/connections",
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });

  const redirectUri = `${appUrl}/api/oauth/${provider.toLowerCase()}/callback`;

  return {
    url: authorizationUrl({
      provider,
      state,
      redirectUri,
      appId,
      ...(provider === "LINKEDIN" ? { codeVerifier } : {}),
    }),
  };
}

export type ConnectCallbackResult =
  | { ok: true; profiles: number; connected: number; skipped: number; disconnected: number }
  | { ok: false; error: string };

/**
 * Runs inside the callback route. Returns a result rather than redirecting so the
 * route stays in charge of the HTTP response.
 */
export async function completeConnectAction(params: {
  state: string | null;
  code: string | null;
  receivedState: string | null;
  error: string | null;
  errorDescription: string | null;
  redirectUri: string;
}): Promise<ConnectCallbackResult> {
  const { workspace } = await requireWorkspace();

  if (params.error) {
    return { ok: false, error: params.errorDescription ?? params.error };
  }

  if (!params.code) {
    return { ok: false, error: "The provider did not return an authorization code." };
  }

  if (!params.state || !params.receivedState || params.state !== params.receivedState) {
    return { ok: false, error: "The authorization state did not match. Start the connection again." };
  }

  // Single-use, and only valid for a few minutes.
  const stateRow = await prisma.oAuthState.findUnique({ where: { state: params.state } });

  if (!stateRow) {
    return { ok: false, error: "This authorization request has already been used or has expired." };
  }

  if (stateRow.expiresAt.getTime() < Date.now()) {
    await prisma.oAuthState.delete({ where: { id: stateRow.id } });

    return { ok: false, error: "This authorization request has expired. Start the connection again." };
  }

  if (stateRow.workspaceId !== workspace.id) {
    return { ok: false, error: "This authorization request belongs to a different workspace." };
  }

  // Consume it before doing any work, so a replayed callback cannot re-run the
  // exchange.
  await prisma.oAuthState.delete({ where: { id: stateRow.id } });

  const provider = stateRow.provider as Provider;

  if (!isProviderConfigured(provider)) {
    return { ok: false, error: "This provider is not configured on the server." };
  }

  const { appId, appSecret } = providerCredentials(provider);

  let credential;

  try {
    credential = await exchangeCode({
      provider,
      code: params.code,
      redirectUri: params.redirectUri,
      appId,
      appSecret,
      codeVerifier: stateRow.codeVerifier ?? undefined,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The provider rejected the authorization.",
    };
  }

  const discovered = await discoverProfiles(provider, credential.accessToken).catch(
    (error: unknown) => ({ error: error instanceof Error ? error.message : "Profile discovery failed." }),
  );

  if ("error" in discovered) {
    return { ok: false, error: discovered.error };
  }

  if (discovered.length === 0) {
    return {
      ok: false,
      error:
        provider === "META"
          ? "This account does not manage any Facebook Page it can post to."
          : "This account does not administer any LinkedIn organisation Page.",
    };
  }

  const connectedByUserId = stateRow.userId;
  let connected = 0;
  let disconnected = 0;

  for (const profile of discovered) {
    // Reconnecting refreshes the credential in place, which is how a
    // REAUTH_REQUIRED connection is cleared.
    const existing = await prisma.socialConnection.findUnique({
      where: {
        workspaceId_provider_providerAccountId: {
          workspaceId: workspace.id,
          provider: stateRow.provider,
          providerAccountId: profile.providerProfileId,
        },
      },
      select: { id: true, status: true },
    });

    const data = {
      displayName: profile.name,
      avatarUrl: profile.avatarUrl,
      status: "ACTIVE" as const,
      accessTokenEncrypted: encryptSecret(credential.accessToken),
      refreshTokenEncrypted: credential.refreshToken ? encryptSecret(credential.refreshToken) : null,
      tokenExpiresAt: credential.expiresAt,
      scopes: credential.scopes,
      connectedByUserId,
      disconnectedAt: null,
    };

    const connection = existing
      ? await prisma.socialConnection.update({ where: { id: existing.id }, data })
      : await prisma.socialConnection.create({
          data: { ...data, workspaceId: workspace.id, provider: stateRow.provider, providerAccountId: profile.providerProfileId },
        });

    if (existing?.status === "DISCONNECTED") {
      disconnected += 1;
    } else {
      connected += 1;
    }

    // A connected Page is a usable profile, so create or refresh the SocialProfile
    // record that publishing targets point at.
    const platform = provider === "META" ? "FACEBOOK" : "LINKEDIN";

    const existingProfile = await prisma.socialProfile.findFirst({
      where: { workspaceId: workspace.id, socialConnectionId: connection.id, platform },
      select: { id: true },
    });

    const profileData = {
      name: profile.name,
      profileUrl: profile.profileUrl,
      avatarUrl: profile.avatarUrl,
      status: "ACTIVE" as const,
      provider: stateRow.provider,
      providerProfileId: profile.providerProfileId,
      socialConnectionId: connection.id,
      // A Page that cannot be posted to is kept visible but marked, so it is
      // never offered for scheduling without pretending it will work.
      ...(profile.canPublish ? {} : { notes: "This account has read-only access to this Page." }),
    };

    if (existingProfile) {
      await prisma.socialProfile.update({ where: { id: existingProfile.id }, data: profileData });
    } else {
      await prisma.socialProfile.create({
        data: {
          ...profileData,
          workspaceId: workspace.id,
          platform,
          type: provider === "META" ? "FACEBOOK_PAGE" : "LINKEDIN_ORGANIZATION",
        },
      });
    }
  }

  revalidatePath("/dashboard/connections");
  revalidatePath("/dashboard/publishing");

  return { ok: true, profiles: discovered.length, connected, skipped: 0, disconnected };
}

/** master.txt 3.6: a manual record can be bound to a real Page after the fact. */
export async function linkProfileAction(params: {
  profileId: string;
  connectionId: string;
  providerProfileId: string;
}): Promise<{ ok: boolean; message: string }> {
  const { workspace } = await requireWorkspace();
  await assertPermission(PERMISSIONS.connectionManage);

  const [profile, connection] = await Promise.all([
    prisma.socialProfile.findFirst({ where: { id: params.profileId, workspaceId: workspace.id } }),
    prisma.socialConnection.findFirst({ where: { id: params.connectionId, workspaceId: workspace.id } }),
  ]);

  if (!profile) {
    return { ok: false, message: "That profile no longer exists." };
  }

  if (!connection) {
    return { ok: false, message: "That connection no longer exists." };
  }

  const platform = connection.provider === "META" ? "FACEBOOK" : "LINKEDIN";

  if (profile.platform !== platform) {
    return {
      ok: false,
      message: `This connection publishes to ${platform} profiles, but the selected profile is ${profile.platform}.`,
    };
  }

  const clash = await prisma.socialProfile.findFirst({
    where: {
      workspaceId: workspace.id,
      socialConnectionId: connection.id,
      providerProfileId: params.providerProfileId,
      id: { not: profile.id },
    },
    select: { id: true, name: true },
  });

  if (clash) {
    return {
      ok: false,
      message: `That Page is already linked to "${clash.name}". Disconnect that link first.`,
    };
  }

  await prisma.socialProfile.update({
    where: { id: profile.id },
    data: {
      socialConnectionId: connection.id,
      provider: connection.provider,
      providerProfileId: params.providerProfileId,
      profileUrl: profile.profileUrl ?? connection.displayName,
      status: "ACTIVE",
    },
  });

  revalidatePath("/dashboard/connections");
  revalidatePath("/dashboard/profiles");

  return { ok: true, message: `Linked ${profile.name} to ${connection.displayName}.` };
}

/**
 * Disconnecting keeps the encrypted token column null and stamps
 * `disconnectedAt`, so a row that once held a credential is still identifiable
 * and the token itself is gone.
 */
export async function disconnectAction(connectionId: string): Promise<{ ok: boolean; message: string }> {
  const { workspace } = await requireWorkspace();
  await assertPermission(PERMISSIONS.connectionManage);

  const connection = await prisma.socialConnection.findFirst({
    where: { id: connectionId, workspaceId: workspace.id },
    select: { id: true, displayName: true, status: true },
  });

  if (!connection) {
    return { ok: false, message: "That connection no longer exists." };
  }

  const affectedTargets = await prisma.postTarget.count({
    where: {
      workspaceId: workspace.id,
      socialProfile: { socialConnectionId: connection.id },
      status: { in: ["QUEUED", "PROCESSING"] },
    },
  });

  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      disconnectedAt: new Date(),
    },
  });

  // Anything still queued on this connection can never succeed, so it is held
  // rather than left to burn three attempts.
  await prisma.postTarget.updateMany({
    where: {
      workspaceId: workspace.id,
      socialProfile: { socialConnectionId: connection.id },
      status: { in: ["QUEUED", "PROCESSING"] },
    },
    data: {
      status: "BLOCKED",
      errorCode: "DISCONNECTED",
      errorMessage: `${connection.displayName} was disconnected before this post went out. Publish it by hand.`,
    },
  });

  await prisma.publishJob.updateMany({
    where: {
      workspaceId: workspace.id,
      status: { in: ["PENDING", "ACTIVE"] },
      postTarget: { socialProfile: { socialConnectionId: connection.id } },
    },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  revalidatePath("/dashboard/connections");

  return {
    ok: true,
    message:
      affectedTargets > 0
        ? `Disconnected. ${affectedTargets} scheduled post${affectedTargets === 1 ? "" : "s"} now need publishing by hand.`
        : "Disconnected.",
  };
}
