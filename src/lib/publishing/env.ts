/**
 * Phase 3 environment.
 *
 * master.txt 3.13 and the deployment notes: provider credentials are server-only
 * and are read through this module so a missing value produces one clear message
 * instead of an undefined string being sent to a provider.
 *
 * Nothing here is validated at import time. A build must not fail because
 * production secrets are absent from a developer's machine, so validation is
 * explicit and happens where a value is actually needed.
 */

export const META_ENV = {
  appId: "META_APP_ID",
  appSecret: "META_APP_SECRET",
} as const;

export const LINKEDIN_ENV = {
  clientId: "LINKEDIN_CLIENT_ID",
  clientSecret: "LINKEDIN_CLIENT_SECRET",
} as const;

export const REQUIRED_ENV = {
  encryptionKey: "ENCRYPTION_KEY",
  redisUrl: "REDIS_URL",
} as const;

export type ProviderCredentials = {
  appId: string;
  appSecret: string;
};

/** Which credentials a provider needs. LinkedIn is public-client + secret. */
export function providerCredentials(
  provider: "META" | "LINKEDIN",
  env: Record<string, string | undefined> = process.env,
): ProviderCredentials {
  if (provider === "META") {
    const appId = env[META_ENV.appId]?.trim();
    const appSecret = env[META_ENV.appSecret]?.trim();

    if (!appId || !appSecret) {
      throw new Error(
        `Meta publishing is not configured: set ${META_ENV.appId} and ${META_ENV.appSecret}.`,
      );
    }

    return { appId, appSecret };
  }

  const appId = env[LINKEDIN_ENV.clientId]?.trim();
  const appSecret = env[LINKEDIN_ENV.clientSecret]?.trim();

  if (!appId || !appSecret) {
    throw new Error(
      `LinkedIn publishing is not configured: set ${LINKEDIN_ENV.clientId} and ${LINKEDIN_ENV.clientSecret}.`,
    );
  }

  return { appId, appSecret };
}

export function isProviderConfigured(
  provider: "META" | "LINKEDIN",
  env: Record<string, string | undefined> = process.env,
): boolean {
  try {
    providerCredentials(provider, env);

    return true;
  } catch {
    return false;
  }
}

/**
 * The public origin the provider redirects back to. Deriving it from the request
 * means a preview deployment connects to Meta as a different app and fails, so
 * in production it must be pinned to the real domain.
 */
export function oauthRedirectUri(
  provider: "META" | "LINKEDIN",
  origin: string,
): string {
  return `${origin.replace(/\/$/, "")}/api/oauth/${provider.toLowerCase()}/callback`;
}

export type ConfigurationReport = {
  provider: "META" | "LINKEDIN";
  configured: boolean;
  missing: string[];
  notes: string[];
};

/**
 * master.txt 3.15: the API Status screen shows what is configured, without
 * printing a single secret value.
 */
export function configurationReport(
  env: Record<string, string | undefined> = process.env,
): ConfigurationReport[] {
  const notes: string[] = [];

  if (!env[REQUIRED_ENV.encryptionKey]) {
    notes.push(`${REQUIRED_ENV.encryptionKey} is not set, so no token can be stored.`);
  }

  if (!env[REQUIRED_ENV.redisUrl]) {
    notes.push(`${REQUIRED_ENV.redisUrl} is not set, so the publish queue is offline.`);
  }

  return (["META", "LINKEDIN"] as const).map((provider) => {
    const missing: string[] = [];
    const keys =
      provider === "META" ? [META_ENV.appId, META_ENV.appSecret] : [LINKEDIN_ENV.clientId, LINKEDIN_ENV.clientSecret];

    for (const key of keys) {
      if (!env[key]?.trim()) {
        missing.push(key);
      }
    }

    return {
      provider,
      configured: missing.length === 0,
      missing,
      notes: missing.length > 0 ? notes : [],
    };
  });
}
