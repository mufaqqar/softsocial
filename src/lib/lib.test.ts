import { describe, expect, it } from "vitest";

import { slugify } from "@/lib/slug";
import { initials, formatBytes, timeAgo, truncate } from "@/lib/format";
import {
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  can,
  isAtLeast,
  permissionsFor,
} from "@/lib/auth/permissions";
import { decryptSession, encryptSession } from "@/lib/auth/token";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("IT Eksperts")).toBe("it-eksperts");
  });

  it("collapses separators and trims the edges", () => {
    expect(slugify("  Hello --- World!!  ")).toBe("hello-world");
  });

  it("strips accents rather than dropping the letter", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });

  it("returns an empty slug when there is nothing ASCII-safe left", () => {
    expect(slugify("日本")).toBe("");
  });
});

describe("initials", () => {
  it("uses the first and last name", () => {
    expect(initials("Ahmed Raza")).toBe("AR");
  });

  it("uses both letters of a single name", () => {
    expect(initials("sara")).toBe("SA");
  });

  it("falls back to a question mark", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("formatBytes", () => {
  it("formats each magnitude", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(1024 * 1024 * 1024 * 3)).toBe("3.0 GB");
    expect(formatBytes(1024 * 1024 * 1024 * 20)).toBe("20 GB");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-01-15T12:00:00.000Z");

  it("describes past and future instants", () => {
    expect(timeAgo(new Date("2026-01-15T09:00:00.000Z"), now)).toBe("3 hours ago");
    expect(timeAgo(new Date("2026-01-15T18:00:00.000Z"), now)).toBe("in 6 hours");
  });

  it("collapses very recent instants", () => {
    expect(timeAgo(new Date("2026-01-15T11:59:59.000Z"), now)).toBe("just now");
  });

  it("accepts an ISO string", () => {
    expect(timeAgo("2026-01-14T12:00:00.000Z", now)).toBe("yesterday");
  });
});

describe("truncate", () => {
  it("leaves short values alone and ellipsises long ones", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("abcdefghijk", 5)).toBe("abcd…");
  });
});

describe("permissions", () => {
  it("gives the owner every permission", () => {
    expect(permissionsFor("OWNER")).toEqual(Object.values(PERMISSIONS));
  });

  it("lets an admin manage the team but not the workspace", () => {
    const admin = permissionsFor("ADMIN");

    expect(can(admin, PERMISSIONS.teamManage)).toBe(true);
    expect(can(admin, PERMISSIONS.workspaceManage)).toBe(false);
  });

  it("lets a member read, comment and work their own targets only", () => {
    const member = permissionsFor("MEMBER");

    expect(can(member, PERMISSIONS.postRead)).toBe(true);
    expect(can(member, PERMISSIONS.postComment)).toBe(true);
    expect(can(member, PERMISSIONS.targetUpdate)).toBe(true);
    expect(can(member, PERMISSIONS.targetUpdateAny)).toBe(false);
    expect(can(member, PERMISSIONS.postManage)).toBe(false);
    expect(can(member, PERMISSIONS.teamManage)).toBe(false);
    expect(can(member, PERMISSIONS.mediaManage)).toBe(false);
  });

  it("never grants more than a strict superset going up the hierarchy", () => {
    for (const permission of ROLE_PERMISSIONS.ADMIN) {
      expect(ROLE_PERMISSIONS.OWNER).toContain(permission);
    }

    for (const permission of ROLE_PERMISSIONS.MEMBER) {
      expect(ROLE_PERMISSIONS.ADMIN).toContain(permission);
    }
  });

  it("does not let anyone promote themselves to owner", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("OWNER");
  });

  it("ranks roles", () => {
    expect(isAtLeast("OWNER", "ADMIN")).toBe(true);
    expect(isAtLeast("ADMIN", "OWNER")).toBe(false);
    expect(isAtLeast("MEMBER", "MEMBER")).toBe(true);
  });

  it("returns nothing for an unknown role", () => {
    expect(permissionsFor("GHOST" as never)).toEqual([]);
  });
});

describe("session tokens", () => {
  it("round-trips sid and uid", async () => {
    const token = await encryptSession({ sid: "sess_1", uid: "user_1" });

    await expect(decryptSession(token)).resolves.toEqual({
      sid: "sess_1",
      uid: "user_1",
    });
  });

  it("rejects a tampered, missing or malformed token", async () => {
    const token = await encryptSession({ sid: "sess_1", uid: "user_1" });

    await expect(decryptSession(`${token}tampered`)).resolves.toBeNull();
    await expect(decryptSession("not-a-jwt")).resolves.toBeNull();
    await expect(decryptSession(undefined)).resolves.toBeNull();
  });

  it("rejects a token whose claims are the wrong shape", async () => {
    // Signed with the same key, so only the payload shape is at fault.
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ sid: 1, uid: 2 })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

    await expect(decryptSession(token)).resolves.toBeNull();
  });
});
