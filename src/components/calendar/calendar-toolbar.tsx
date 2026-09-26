"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CALENDAR_VIEWS, CALENDAR_VIEW_LABELS, type CalendarView } from "@/lib/constants";
import {
  dayTitle,
  monthTitle,
  shiftDay,
  shiftMonth,
  shiftWeek,
  todayKey as computeTodayKey,
  weekTitle,
  type DateKey,
} from "@/lib/scheduling";
import { timeZoneOffsetLabel } from "@/lib/time-zones";

/**
 * The view switcher and the date stepper.
 *
 * The view and the anchor date both live in the URL, so a particular week of the
 * calendar is a link somebody can paste into a message. Navigation re-queries
 * rather than moving tasks around, and "Today" is a jump back to the current
 * date in the workspace timezone.
 */
export function CalendarToolbar({
  view,
  anchorKey,
  timeZone,
}: {
  view: CalendarView;
  anchorKey: DateKey;
  timeZone: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function navigate(next: Partial<{ view: CalendarView; date: DateKey }>) {
    const query = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value) {
        query.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(`?${query.toString()}`, { scroll: false });
    });
  }

  const step = view === "MONTH" ? 1 : view === "WEEK" ? 7 : 1;
  const title =
    view === "MONTH"
      ? monthTitle(anchorKey)
      : view === "WEEK"
        ? weekTitle(anchorKey)
        : dayTitle(anchorKey);

  const today = computeTodayKey(new Date(), timeZone);

  function shift(direction: -1 | 1) {
    const nextDate =
      view === "MONTH"
        ? shiftMonth(anchorKey, direction)
        : view === "WEEK"
          ? shiftWeek(anchorKey, direction)
          : shiftDay(anchorKey, direction * step);

    navigate({ date: nextDate });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs
        value={view}
        onValueChange={(value) => navigate({ view: value as CalendarView })}
      >
        <TabsList>
          {CALENDAR_VIEWS.map((value) => (
            <TabsTrigger key={value} value={value} disabled={pending}>
              {CALENDAR_VIEW_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Previous ${CALENDAR_VIEW_LABELS[view].toLowerCase()}`}
          onClick={() => shift(-1)}
          disabled={pending}
        >
          <ChevronLeft />
        </Button>

        <div className="min-w-[13rem] text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="text-muted-foreground size-4" />
            {title}
          </p>
          <p className="text-muted-foreground text-xs">
            {timeZone} ({timeZoneOffsetLabel(timeZone)})
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Next ${CALENDAR_VIEW_LABELS[view].toLowerCase()}`}
          onClick={() => shift(1)}
          disabled={pending}
        >
          <ChevronRight />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate({ date: today })}
          disabled={pending || anchorKey === today}
        >
          Today
        </Button>
      </div>
    </div>
  );
}
