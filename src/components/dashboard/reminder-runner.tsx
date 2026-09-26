"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { deliverDueRemindersAction } from "@/actions/schedule";

/**
 * master.txt 2.7: the in-app reminder.
 *
 * Nothing schedules itself. A reminder fires the next time a dashboard page is
 * rendered and the moment it was set for has passed, which means it lands the
 * next time the assignee opens the app. The action is idempotent per reminder,
 * so running it on every navigation does not produce duplicates.
 *
 * The limit is stated in the UI rather than hidden: a reminder cannot fire while
 * the app is closed, because doing so would need a background worker and this
 * phase has none.
 */
export function ReminderRunner() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void deliverDueRemindersAction().then((result) => {
      if (!cancelled && result.delivered > 0) {
        router.refresh();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
