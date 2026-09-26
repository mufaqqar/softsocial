import { describe, expect, it } from "vitest";

import {
  dateKeyOf,
  dateKeyRange,
  dayTitle,
  deriveReminderAt,
  effectiveTargetStatus,
  isDateKey,
  isOverdue,
  isTimeKey,
  minuteOf,
  monthGrid,
  monthTitle,
  relativeDayLabel,
  shiftDay,
  shiftMonth,
  shiftWeek,
  timeKeyOf,
  todayKey,
  toZonedInstant,
  viewRange,
  weekDateKeys,
  weekTitle,
  zonedDayRange,
} from "@/lib/scheduling";

const KARACHI = "Asia/Karachi";
const NEW_YORK = "America/New_York";
const UTC = "UTC";

describe("date and time keys", () => {
  it("accepts real calendar dates and rejects impossible ones", () => {
    expect(isDateKey("2026-09-30")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-9-30")).toBe(false);
    expect(isDateKey("")).toBe(false);
    expect(isDateKey(20260930)).toBe(false);
  });

  it("accepts 24-hour times only", () => {
    expect(isTimeKey("00:00")).toBe(true);
    expect(isTimeKey("23:59")).toBe(true);
    expect(isTimeKey("24:00")).toBe(false);
    expect(isTimeKey("9:30")).toBe(false);
    expect(isTimeKey("10:60")).toBe(false);
    expect(isTimeKey("10:30:00")).toBe(false);
  });
});

describe("wall date to instant conversion", () => {
  it("turns 10:00 Karachi time into the matching UTC instant", () => {
    // Karachi is UTC+5 all year, so 10:00 local is 05:00 UTC.
    expect(toZonedInstant("2026-09-30", "10:00", KARACHI)?.toISOString()).toBe(
      "2026-09-30T05:00:00.000Z",
    );
  });

  it("accounts for daylight saving in a zone that observes it", () => {
    // New York is UTC-4 in September and UTC-5 in January.
    expect(toZonedInstant("2026-09-30", "10:00", NEW_YORK)?.toISOString()).toBe(
      "2026-09-30T14:00:00.000Z",
    );
    expect(toZonedInstant("2026-01-15", "10:00", NEW_YORK)?.toISOString()).toBe(
      "2026-01-15T15:00:00.000Z",
    );
  });

  it("returns null for keys that are not a date and a time", () => {
    expect(toZonedInstant("2026-02-30", "10:00", UTC)).toBeNull();
    expect(toZonedInstant("2026-09-30", "nope", UTC)).toBeNull();
  });

  it("round-trips an instant back to the same wall date and time", () => {
    const instant = toZonedInstant("2026-09-30", "10:00", KARACHI)!;

    expect(dateKeyOf(instant, KARACHI)).toBe("2026-09-30");
    expect(timeKeyOf(instant, KARACHI)).toBe("10:00");
  });

  it("builds a half-open day range that spans a whole local day", () => {
    const { from, to } = zonedDayRange("2026-09-30", KARACHI);

    expect(from.toISOString()).toBe("2026-09-29T19:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-30T19:00:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("calendar grids", () => {
  it("builds a six-week month grid starting on Monday", () => {
    const grid = monthGrid("2026-09-30", KARACHI);

    expect(grid).toHaveLength(42);
    expect(grid[0]!.dateKey).toBe("2026-08-31");
    expect(grid[0]!.inMonth).toBe(false);
    expect(grid[5]!.dateKey).toBe("2026-09-05");
    expect(grid[5]!.inMonth).toBe(true);
    expect(grid[41]!.dateKey).toBe("2026-10-11");
  });

  it("marks today using the workspace timezone, not the server one", () => {
    // 22:30 UTC is already the next day in Karachi.
    const now = new Date("2026-09-30T22:30:00.000Z");

    expect(todayKey(now, KARACHI)).toBe("2026-10-01");
    expect(todayKey(now, UTC)).toBe("2026-09-30");

    const grid = monthGrid("2026-10-01", KARACHI, now);
    const today = grid.filter((cell) => cell.isToday);

    expect(today.map((cell) => cell.dateKey)).toEqual(["2026-10-01"]);
  });

  it("returns the Monday-to-Sunday week containing the anchor", () => {
    expect(weekDateKeys("2026-09-30")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("spans a day range inclusively", () => {
    expect(dateKeyRange("2026-09-30", 3)).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(dateKeyRange("2026-09-30", 0)).toEqual(["2026-09-30"]);
  });
});

describe("calendar navigation", () => {
  it("steps months and clamps the day to the shorter month", () => {
    expect(shiftMonth("2026-09-30", 1)).toBe("2026-10-30");
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonth("2026-09-30", -9)).toBe("2025-12-30");
  });

  it("steps weeks and days in both directions", () => {
    expect(shiftWeek("2026-09-30", 1)).toBe("2026-10-07");
    expect(shiftWeek("2026-09-30", -2)).toBe("2026-09-16");
    expect(shiftDay("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("titles each view", () => {
    expect(monthTitle("2026-09-30")).toBe("September 2026");
    // The week crosses into October, so the month is repeated on the right.
    expect(weekTitle("2026-09-30")).toBe("Sep 28 – Oct 4, 2026");
    // A week inside one month does not repeat it.
    expect(weekTitle("2026-09-15")).toBe("Sep 14 – 20, 2026");
    expect(dayTitle("2026-09-30")).toBe("Wednesday, September 30, 2026");
  });

  it("labels nearby days relatively", () => {
    const now = new Date("2026-09-30T06:00:00.000Z");

    expect(relativeDayLabel("2026-09-30", KARACHI, now)).toBe("Today");
    expect(relativeDayLabel("2026-10-01", KARACHI, now)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-09-29", KARACHI, now)).toBe("Yesterday");
    expect(relativeDayLabel("2026-10-05", KARACHI, now)).toBe("Mon, Oct 5");
  });
});

describe("viewRange", () => {
  it("covers the whole visible grid for a month view", () => {
    const { keys, from, to } = viewRange("MONTH", "2026-09-30", KARACHI, 30);

    expect(keys).toHaveLength(42);
    expect(keys[0]).toBe("2026-08-31");
    expect(keys[41]).toBe("2026-10-11");
    // One day past the last cell, so a 23:30 post on the last day is included.
    expect(to.toISOString()).toBe("2026-10-11T19:00:00.000Z");
    expect(from.toISOString()).toBe("2026-08-30T19:00:00.000Z");
  });

  it("covers a single day for the day view", () => {
    const { keys, from, to } = viewRange("DAY", "2026-09-30", KARACHI, 30);

    expect(keys).toEqual(["2026-09-30"]);
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("honours the agenda span", () => {
    expect(viewRange("AGENDA", "2026-09-30", KARACHI, 3).keys).toHaveLength(3);
  });
});

describe("overdue derivation", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  it("reads a past-due pending target as OVERDUE", () => {
    expect(effectiveTargetStatus("PENDING", new Date("2026-09-30T05:00:00.000Z"), now)).toBe(
      "OVERDUE",
    );
  });

  it("treats the exact due instant as overdue", () => {
    expect(effectiveTargetStatus("PENDING", now, now)).toBe("OVERDUE");
  });

  it("leaves a future target alone", () => {
    expect(effectiveTargetStatus("PENDING", new Date("2026-09-30T13:00:00.000Z"), now)).toBe(
      "PENDING",
    );
  });

  it("never overrides a status a person already set", () => {
    const past = new Date("2026-09-30T05:00:00.000Z");

    for (const status of ["IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"] as const) {
      expect(effectiveTargetStatus(status, past, now)).toBe(status);
    }
  });

  it("leaves an unscheduled target alone however old the post is", () => {
    expect(effectiveTargetStatus("PENDING", null, now)).toBe("PENDING");
    expect(isOverdue("PENDING", undefined, now)).toBe(false);
  });
});

describe("reminders", () => {
  const scheduledAt = new Date("2026-09-30T05:00:00.000Z");

  it("subtracts the lead time from the schedule", () => {
    expect(deriveReminderAt(scheduledAt, 15)?.toISOString()).toBe(
      "2026-09-30T04:45:00.000Z",
    );
    expect(deriveReminderAt(scheduledAt, 1440)?.toISOString()).toBe(
      "2026-09-29T05:00:00.000Z",
    );
  });

  it("produces no reminder when no lead time is asked for", () => {
    expect(deriveReminderAt(scheduledAt, 0)).toBeNull();
    expect(deriveReminderAt(scheduledAt, -5)).toBeNull();
    expect(deriveReminderAt(null, 15)).toBeNull();
  });
});

describe("minuteOf", () => {
  it("extracts the wall-clock minute of day in the given zone", () => {
    const instant = new Date("2026-09-30T05:30:00.000Z");

    expect(minuteOf(instant, KARACHI)).toBe(10 * 60 + 30);
    expect(minuteOf(instant, UTC)).toBe(5 * 60 + 30);
  });
});
