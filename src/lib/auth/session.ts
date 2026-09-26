import "server-only";

import { cookies } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  decryptSession,
  encryptSession,
  type SessionPayload,
} from "@/lib/auth/token";

function isSecure() {
  return process.env.NODE_ENV === "production";
}

export async function createSessionCookie(
  sessionId: string,
  userId: string,
): Promise<void> {
  const token = await encryptSession({ sid: sessionId, uid: userId });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
}

export async function readSessionCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decryptSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export { decryptSession, encryptSession, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "@/lib/auth/token";
export type { SessionPayload } from "@/lib/auth/token";
