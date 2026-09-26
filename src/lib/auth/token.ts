import { SignJWT, jwtVerify } from "jose";

import { SESSION_COOKIE } from "@/lib/auth/constants";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export type SessionPayload = {
  /** Row id in the Session table. */
  sid: string;
  /** User id. */
  uid: string;
};

export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is not set.");
  }

  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload): Promise<string> {  return new SignJWT({ sid: payload.sid, uid: payload.uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Verifies the cookie signature only. Callers must additionally confirm the
 * Session row still exists and is unrevoked - see `getSession` in the DAL.
 */
export async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.sid !== "string" || typeof payload.uid !== "string") {
      return null;
    }

    return { sid: payload.sid, uid: payload.uid };
  } catch {
    return null;
  }
}
