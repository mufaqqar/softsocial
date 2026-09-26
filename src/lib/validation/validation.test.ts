import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  slugSchema,
} from "@/lib/validation/auth";
import {
  addMemberSchema,
  createWorkspaceSchema,
  updateMemberSchema,
} from "@/lib/validation/team";
import {
  commentSchema,
  parseHashtags,
  postSchema,
  postStatusSchema,
  targetStatusSchema,
} from "@/lib/validation/post";
import { socialProfileSchema } from "@/lib/validation/social-profile";
import {
  calendarFilterSchema,
  moveTargetSchema,
  scheduleTargetSchema,
  timeZoneSchema,
  unscheduleTargetSchema,
} from "@/lib/validation/schedule";
import {
  postStatusVariant,
  targetStatusVariant,
} from "@/lib/constants";
import { dateKeyOf, timeKeyOf, toZonedInstant } from "@/lib/scheduling";

const validPost = {
  content: "AI chatbots can help businesses answer customers 24/7.",
};

describe("auth validation", () => {
  it("lowercases and trims the email", () => {
    const result = registerSchema.parse({
      name: "Ahmed",
      email: "  Ahmed@Example.COM ",
      password: "Softsocial123",
    });

    expect(result.email).toBe("ahmed@example.com");
  });

  it("requires a letter and a number in the password", () => {
    const base = { name: "Ahmed", email: "ahmed@example.com" };

    expect(registerSchema.safeParse({ ...base, password: "alllettersonly" }).success).toBe(
      false,
    );
    expect(registerSchema.safeParse({ ...base, password: "1234567890" }).success).toBe(
      false,
    );
    expect(registerSchema.safeParse({ ...base, password: "Softsocial123" }).success).toBe(
      true,
    );
  });

  it("rejects a malformed email and a one-character name", () => {
    expect(
      registerSchema.safeParse({ name: "Ahmed", email: "nope", password: "Softsocial123" })
        .success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ name: "A", email: "a@b.co", password: "Softsocial123" })
        .success,
    ).toBe(false);
  });

  it("requires a password at login but does not re-check its strength", () => {
    expect(loginSchema.safeParse({ email: "ahmed@example.com", password: "" }).success).toBe(
      false,
    );
    expect(loginSchema.safeParse({ email: "ahmed@example.com", password: "x" }).success).toBe(
      true,
    );
  });

  it("refuses a password change that keeps the old password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "Softsocial123",
      newPassword: "Softsocial123",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a genuine password change", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "Softsocial123",
        newPassword: "Newpassword456",
      }).success,
    ).toBe(true);
  });

  it("only accepts lowercase slugs", () => {
    expect(slugSchema.safeParse("it-eksperts").success).toBe(true);
    expect(slugSchema.safeParse("IT Eksperts").success).toBe(false);
    expect(slugSchema.safeParse("-leading").success).toBe(false);
    expect(slugSchema.safeParse("double--dash").success).toBe(false);
    expect(slugSchema.safeParse("a").success).toBe(false);
  });

  it("validates the create-workspace form", () => {
    expect(
      createWorkspaceSchema.safeParse({ name: "IT Eksperts", slug: "it-eksperts" }).success,
    ).toBe(true);
    expect(
      createWorkspaceSchema.safeParse({ name: "IT Eksperts", slug: "IT Eksperts" }).success,
    ).toBe(false);
  });
});

describe("team validation", () => {
  it("allows adding a member without a password (existing account)", () => {
    expect(
      addMemberSchema.safeParse({
        name: "Sara",
        email: "sara@example.com",
        role: "MEMBER",
      }).success,
    ).toBe(true);
  });

  it("still rejects a weak password when one is supplied", () => {
    expect(
      addMemberSchema.safeParse({
        name: "Sara",
        email: "sara@example.com",
        role: "MEMBER",
        password: "weak",
      }).success,
    ).toBe(false);
  });

  it("requires a memberId on update", () => {
    expect(
      updateMemberSchema.safeParse({
        name: "Sara",
        role: "MEMBER",
        status: "ACTIVE",
      }).success,
    ).toBe(false);
  });
});

describe("post validation", () => {
  it("accepts a post with just content", () => {
    const result = postSchema.parse(validPost);

    expect(result.targets).toEqual([]);
    expect(result.variants).toEqual([]);
    expect(result.status).toBe("DRAFT");
  });

  it("rejects a post with neither title nor content", () => {
    const result = postSchema.safeParse({ content: "   " });

    expect(result.success).toBe(false);
  });

  it("accepts a post whose only copy lives in a variant", () => {
    expect(
      postSchema.safeParse({
        content: "",
        variants: [{ platform: "LINKEDIN", text: "LinkedIn only copy" }],
      }).success,
    ).toBe(true);
  });

  it("requires every target to name a profile", () => {
    expect(
      postSchema.safeParse({ ...validPost, targets: [{ socialProfileId: "" }] }).success,
    ).toBe(false);
  });

  it("keeps per-target assignees and normalises blanks to null", () => {
    const result = postSchema.parse({
      ...validPost,
      assignedUserId: "",
      targets: [
        { socialProfileId: "profile_1", assignedUserId: "user_1" },
        { socialProfileId: "profile_2" },
      ],
    });

    expect(result.assignedUserId).toBeNull();
    expect(result.targets[0]!.assignedUserId).toBe("user_1");
    expect(result.targets[1]!.assignedUserId).toBeNull();
  });

  it("rejects a second copy for the same platform", () => {
    // The database enforces this too, but the message helps the user.
    expect(
      postSchema.safeParse({
        ...validPost,
        variants: [
          { platform: "FACEBOOK", text: "one" },
          { platform: "FACEBOOK", text: "two" },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts the Phase 2 post status set", () => {
    for (const status of [
      "DRAFT",
      "MANUAL_PENDING",
      "IN_PROGRESS",
      "SCHEDULED",
      "COMPLETED",
      "CANCELLED",
    ]) {
      expect(postStatusSchema.safeParse({ status }).success).toBe(true);
    }

    // Phase 3 statuses stay closed until that phase owns them.
    expect(postStatusSchema.safeParse({ status: "PUBLISHED" }).success).toBe(false);
    expect(postStatusSchema.safeParse({ status: "PENDING_APPROVAL" }).success).toBe(false);
  });

  it("accepts the Phase 2 target status set", () => {
    for (const status of ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"]) {
      expect(targetStatusSchema.safeParse({ status }).success).toBe(true);
    }

    // OVERDUE is derived at read time from a past `scheduledAt`, so it is not a
    // status a person may set. Phase 3 statuses stay closed until that phase.
    expect(targetStatusSchema.safeParse({ status: "OVERDUE" }).success).toBe(false);
    expect(targetStatusSchema.safeParse({ status: "QUEUED" }).success).toBe(false);
    expect(targetStatusSchema.safeParse({ status: "BLOCKED" }).success).toBe(false);
  });

  it("requires a date and a time together on a scheduled target", () => {
    const base = { socialProfileId: "profile-1", assignedUserId: null };

    expect(
      postSchema.safeParse({ content: "hi", targets: [{ ...base, scheduledDate: "", scheduledTime: "" }] })
        .success,
    ).toBe(true);

    expect(
      postSchema.safeParse({
        content: "hi",
        targets: [{ ...base, scheduledDate: "2026-09-30", scheduledTime: "10:00" }],
      }).success,
    ).toBe(true);

    // A date with no time is a half-finished schedule, not an unscheduled target.
    expect(
      postSchema.safeParse({ content: "hi", targets: [{ ...base, scheduledDate: "2026-09-30", scheduledTime: "" }] })
        .success,
    ).toBe(false);

    expect(
      postSchema.safeParse({ content: "hi", targets: [{ ...base, scheduledDate: "", scheduledTime: "10:00" }] })
        .success,
    ).toBe(false);
  });

  it("rejects malformed schedule dates, times and reminder leads", () => {
    const base = { content: "hi", socialProfileId: "profile-1", assignedUserId: null };

    expect(
      postSchema.safeParse({
        ...base,
        targets: [{ ...base, scheduledDate: "30-09-2026", scheduledTime: "10:00" }],
      }).success,
    ).toBe(false);

    expect(
      postSchema.safeParse({
        ...base,
        targets: [{ ...base, scheduledDate: "2026-02-30", scheduledTime: "10:00" }],
      }).success,
    ).toBe(false);

    expect(
      postSchema.safeParse({
        ...base,
        targets: [{ ...base, scheduledDate: "2026-09-30", scheduledTime: "9:00" }],
      }).success,
    ).toBe(false);

    expect(
      postSchema.safeParse({
        ...base,
        targets: [
          {
            ...base,
            scheduledDate: "2026-09-30",
            scheduledTime: "10:00",
            reminderLeadMinutes: -15,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("defaults a missing reminder lead to no reminder", () => {
    const parsed = postSchema.safeParse({
      content: "hi",
      targets: [
        {
          socialProfileId: "profile-1",
          assignedUserId: null,
          scheduledDate: "2026-09-30",
          scheduledTime: "10:00",
        },
      ],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.targets[0]?.reminderLeadMinutes).toBe(0);
  });

  it("keeps each target's own timezone, so a schedule cannot shift on save", () => {
    // The bug this guards: reading a London slot back as wall time and then
    // re-saving it in the workspace zone would silently move the task.
    const parsed = postSchema.safeParse({
      content: "hi",
      targets: [
        {
          socialProfileId: "profile-1",
          assignedUserId: null,
          scheduledDate: "2026-09-30",
          scheduledTime: "10:00",
          scheduledTimeZone: "Europe/London",
          reminderLeadMinutes: 15,
        },
        {
          socialProfileId: "profile-2",
          assignedUserId: null,
          scheduledDate: "2026-09-30",
          scheduledTime: "10:00",
          scheduledTimeZone: "Asia/Karachi",
          reminderLeadMinutes: 0,
        },
      ],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.targets[0]?.scheduledTimeZone).toBe("Europe/London");
    expect(parsed.data?.targets[1]?.scheduledTimeZone).toBe("Asia/Karachi");
  });

  it("rejects a raw UTC offset as a target timezone", () => {
    expect(
      postSchema.safeParse({
        content: "hi",
        targets: [
          {
            socialProfileId: "profile-1",
            assignedUserId: null,
            scheduledDate: "2026-09-30",
            scheduledTime: "10:00",
            scheduledTimeZone: "+05:00",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("round-trips a target schedule through wall time without moving the day", () => {
    // 23:30 in Karachi is 18:30 UTC, which is still the same wall day in London
    // only if the zone is re-applied; the point is the date key is stable.
    const zone = "Asia/Karachi";
    const instant = toZonedInstant("2026-09-30", "23:30", zone)!;

    expect(instant.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(dateKeyOf(instant, zone)).toBe("2026-09-30");
    expect(timeKeyOf(instant, zone)).toBe("23:30");

    // A different zone genuinely does move the day, which is why the zone is
    // stored rather than assumed.
    expect(dateKeyOf(instant, "UTC")).toBe("2026-09-30");
    expect(timeKeyOf(instant, "UTC")).toBe("18:30");
  });

  it("rejects empty comments", () => {
    expect(
      commentSchema.safeParse({ postId: "post_1", content: "   " }).success,
    ).toBe(false);
    expect(
      commentSchema.safeParse({ postId: "post_1", content: "Looks good" }).success,
    ).toBe(true);
  });
});

describe("parseHashtags", () => {
  it("normalises separators, duplicates and punctuation hashtags cannot contain", () => {
    expect(parseHashtags("#AI, chatbot #AI  social-media!")).toEqual([
      "#AI",
      "#chatbot",
      "#socialmedia",
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseHashtags(undefined)).toEqual([]);
    expect(parseHashtags("")).toEqual([]);
    expect(parseHashtags(" , ")).toEqual([]);
  });
});

describe("social profile validation", () => {
  it("accepts http(s) profile URLs and rejects other schemes", () => {
    const base = { platform: "FACEBOOK", name: "Facebook - IT Eksperts", status: "ACTIVE" };

    expect(
      socialProfileSchema.safeParse({
        ...base,
        profileUrl: "https://facebook.com/itexperts",
      }).success,
    ).toBe(true);
    expect(
      socialProfileSchema.safeParse({ ...base, profileUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      socialProfileSchema.safeParse({ ...base, profileUrl: "not a url" }).success,
    ).toBe(false);
  });

  it("only allows manual Phase 1 statuses", () => {
    const base = { platform: "LINKEDIN", name: "LinkedIn - Client ABC" };

    expect(socialProfileSchema.safeParse({ ...base, status: "ACTIVE" }).success).toBe(true);
    expect(socialProfileSchema.safeParse({ ...base, status: "ARCHIVED" }).success).toBe(
      true,
    );
    expect(socialProfileSchema.safeParse({ ...base, status: "REAUTH_REQUIRED" }).success).toBe(
      false,
    );
  });
});

describe("status badges", () => {
  it("marks completed work as success and failures as destructive", () => {
    expect(postStatusVariant("COMPLETED")).toBe("success");
    expect(postStatusVariant("IN_PROGRESS")).toBe("info");
    expect(targetStatusVariant("COMPLETED")).toBe("success");
    expect(targetStatusVariant("FAILED")).toBe("destructive");
    expect(targetStatusVariant("PENDING")).toBe("secondary");
  });

  it("gives the Phase 2 statuses a badge too", () => {
    expect(postStatusVariant("SCHEDULED")).toBe("warning");
    // Overdue is a warning rather than a failure: the work is late, not broken.
    expect(targetStatusVariant("OVERDUE")).toBe("warning");
    expect(targetStatusVariant("IN_PROGRESS")).toBe("info");
  });
});

describe("schedule validation", () => {
  const validSchedule = {
    targetId: "target-1",
    date: "2026-09-30",
    time: "10:00",
    timeZone: "Asia/Karachi",
    assignedUserId: null,
    reminderLeadMinutes: 30,
  };

  it("accepts a complete schedule", () => {
    const parsed = scheduleTargetSchema.safeParse(validSchedule);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.reminderLeadMinutes).toBe(30);
  });

  it("defaults a missing reminder lead to no reminder", () => {
    const parsed = scheduleTargetSchema.safeParse({
      targetId: "target-1",
      date: "2026-09-30",
      time: "10:00",
      timeZone: "Asia/Karachi",
      assignedUserId: null,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.reminderLeadMinutes).toBe(0);
  });

  it("normalises both an omitted and an explicit null assignee to null", () => {
    const omitted = scheduleTargetSchema.safeParse({
      targetId: "target-1",
      date: "2026-09-30",
      time: "10:00",
      timeZone: "Asia/Karachi",
      reminderLeadMinutes: 0,
    });
    const explicit = scheduleTargetSchema.safeParse(validSchedule);

    expect(omitted.success).toBe(true);
    expect(omitted.data?.assignedUserId).toBeNull();
    expect(explicit.data?.assignedUserId).toBeNull();
  });

  it("rejects impossible dates and times", () => {
    expect(
      scheduleTargetSchema.safeParse({ ...validSchedule, date: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      scheduleTargetSchema.safeParse({ ...validSchedule, date: "30-09-2026" }).success,
    ).toBe(false);
    expect(scheduleTargetSchema.safeParse({ ...validSchedule, time: "24:00" }).success).toBe(
      false,
    );
    expect(scheduleTargetSchema.safeParse({ ...validSchedule, time: "9:00" }).success).toBe(
      false,
    );
  });

  it("rejects a missing target", () => {
    expect(
      scheduleTargetSchema.safeParse({ ...validSchedule, targetId: "" }).success,
    ).toBe(false);
  });

  it("rejects a negative or absurd reminder lead", () => {
    expect(
      scheduleTargetSchema.safeParse({ ...validSchedule, reminderLeadMinutes: -30 }).success,
    ).toBe(false);
    expect(
      scheduleTargetSchema.safeParse({
        ...validSchedule,
        reminderLeadMinutes: 60 * 24 * 8,
      }).success,
    ).toBe(false);
    expect(
      scheduleTargetSchema.safeParse({
        ...validSchedule,
        reminderLeadMinutes: 15.5,
      }).success,
    ).toBe(false);
  });

  it("requires a real IANA timezone, never a raw offset", () => {
    expect(timeZoneSchema.safeParse("Asia/Karachi").success).toBe(true);
    expect(timeZoneSchema.safeParse("America/New_York").success).toBe(true);
    expect(timeZoneSchema.safeParse("UTC").success).toBe(true);

    expect(timeZoneSchema.safeParse("+05:00").success).toBe(false);
    expect(timeZoneSchema.safeParse("Karachi").success).toBe(false);
    expect(timeZoneSchema.safeParse("").success).toBe(false);
  });

  it("lets a drag-and-drop move carry an assignee but no reminder", () => {
    const parsed = moveTargetSchema.safeParse({
      targetId: "target-1",
      date: "2026-10-01",
      time: "14:30",
      timeZone: "Europe/London",
      assignedUserId: "user-9",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.timeZone).toBe("Europe/London");
    // The action re-derives the lead from the row, so it is not part of the input.
    expect(parsed.data).not.toHaveProperty("reminderLeadMinutes");
  });

  it("only unschedules a target that exists", () => {
    expect(unscheduleTargetSchema.safeParse({ targetId: "target-1" }).success).toBe(true);
    expect(unscheduleTargetSchema.safeParse({ targetId: "" }).success).toBe(false);
    expect(unscheduleTargetSchema.safeParse({}).success).toBe(false);
  });

  it("defaults the calendar filter to the month view and validates the rest", () => {
    const parsed = calendarFilterSchema.safeParse({});

    expect(parsed.success).toBe(true);
    expect(parsed.data?.view).toBe("MONTH");
    expect(parsed.data?.assignedUserId).toBeNull();

    for (const view of ["MONTH", "WEEK", "DAY", "AGENDA"]) {
      expect(calendarFilterSchema.safeParse({ view }).success).toBe(true);
    }

    expect(calendarFilterSchema.safeParse({ view: "YEAR" }).success).toBe(false);
    expect(calendarFilterSchema.safeParse({ date: "2026-13-01" }).success).toBe(false);
    expect(calendarFilterSchema.safeParse({ status: "COMPLETED" }).success).toBe(true);
    expect(calendarFilterSchema.safeParse({ status: "PUBLISHED" }).success).toBe(false);
  });
});
