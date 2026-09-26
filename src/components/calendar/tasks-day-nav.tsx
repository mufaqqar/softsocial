"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { shiftDay, todayKey as computeTodayKey } from "@/lib/scheduling";
import { timeZoneOffsetLabel } from "@/lib/time-zones";
import type { DateKey } from "@/lib/scheduling";

/**
 * The day stepper for the task list. Like the calendar it keeps the day in the
 * URL, so "what is due on the 14th" is a link rather than a series of clicks.
 */
export function TasksDayNav({
  dateKey,
  timeZone,
  assignedUserId,
  includeCompleted,
}: {
  dateKey: DateKey;
  timeZone: string;
  assignedUserId: string | null;
  includeCompleted: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(date: DateKey) {
    const query = new URLSearchParams(params.toString());
    query.set("date", date);

    startTransition(() => {
      router.replace(`?${query.toString()}`, { scroll: false });
    });
  }

  function toggleIncludeCompleted() {
    const query = new URLSearchParams(params.toString());

    if (includeCompleted) {
      query.delete("includeCompleted");
    } else {
      query.set("includeCompleted", "true");
    }

    startTransition(() => {
      router.replace(`?${query.toString()}`, { scroll: false });
    });
  }

  const today = computeTodayKey(new Date(), timeZone);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous day"
          onClick={() => go(shiftDay(dateKey, -1))}
          disabled={pending}
        >
          <ChevronLeft />
        </Button>

        <div className="min-w-[12rem] text-center">
          <p className="text-sm font-semibold tabular-nums">{dateKey}</p>
          <p className="text-muted-foreground text-xs">
            {timeZone} ({timeZoneOffsetLabel(timeZone)})
            {assignedUserId ? " · filtered to one assignee" : ""}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next day"
          onClick={() => go(shiftDay(dateKey, 1))}
          disabled={pending}
        >
          <ChevronRight />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => go(today)}
          disabled={pending || dateKey === today}
        >
          Today
        </Button>
      </div>

      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={includeCompleted}
          onChange={toggleIncludeCompleted}
          disabled={pending}
        />
        Show completed and cancelled
      </label>
    </div>
  );
}
