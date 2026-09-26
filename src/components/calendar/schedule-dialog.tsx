"use client";

import { useActionState, useState, useTransition } from "react";
import { CalendarClock, Trash2 } from "lucide-react";

import { unscheduleTargetAction, scheduleTargetAction } from "@/actions/schedule";
import { FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { REMINDER_LEAD_MINUTES, REMINDER_LEAD_LABELS } from "@/lib/constants";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { COMMON_TIME_ZONES, timeZoneOffsetLabel } from "@/lib/time-zones";

/**
 * master.txt 2.3. The one place a schedule is set by hand, shared by the
 * calendar and the post detail page so both write the same columns.
 *
 * The wall date and wall time are the source of truth: they are sent as typed
 * along with the zone, and the server re-derives the instant. That is why the
 * dialog never shows a raw UTC timestamp - it would invite the reader to treat
 * the stored instant as the schedule.
 */
export function ScheduleDialog({
  targetId,
  profileName,
  initialDate,
  initialTime,
  initialTimeZone,
  initialAssigneeId,
  initialReminderLeadMinutes,
  assignees,
  workspaceTimeZone,
  trigger,
}: {
  targetId: string;
  profileName: string;
  /** Null when the target has no date yet, which is the "schedule it" case. */
  initialDate: string | null;
  initialTime: string | null;
  initialTimeZone: string | null;
  initialAssigneeId: string | null;
  initialReminderLeadMinutes: number | null;
  assignees: { userId: string; name: string }[];
  workspaceTimeZone: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The dialog closes from inside the action rather than from an effect on the
  // result: `setOpen` in an effect body re-renders the whole tree a second time
  // for every submission.
  const [scheduleState, scheduleAction] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const next = await scheduleTargetAction(prev, formData);

      if (next?.ok) {
        setOpen(false);
      }

      return next;
    },
    EMPTY_FORM_STATE,
  );
  const [unscheduleState, setUnscheduleState] = useState<FormState>(undefined);
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState(initialTime ?? "");
  const [timeZone, setTimeZone] = useState(initialTimeZone || workspaceTimeZone);
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId ?? "");
  const [reminderLead, setReminderLead] = useState(String(initialReminderLeadMinutes ?? 0));

  function unschedule() {
    const formData = new FormData();
    formData.set("payload", JSON.stringify({ targetId }));

    startTransition(async () => {
      const next = await unscheduleTargetAction(EMPTY_FORM_STATE, formData);
      setUnscheduleState(next);

      if (next?.ok) {
        setOpen(false);
      }
    });
  }

  const zones = COMMON_TIME_ZONES.some((zone) => zone.value === timeZone)
    ? COMMON_TIME_ZONES
    : [{ value: timeZone, label: timeZone, region: "Current" }, ...COMMON_TIME_ZONES];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <CalendarClock />
            Schedule
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule {profileName}</DialogTitle>
          <DialogDescription>
            Pick the day and time to publish. The timezone is stored with the schedule so the day
            cannot shift later.
          </DialogDescription>
        </DialogHeader>

        <FormFeedback state={scheduleState} />
        <FormFeedback state={unscheduleState} />

        <form action={scheduleAction} className="space-y-4">
          <input type="hidden" name="payload" value={JSON.stringify({
            targetId,
            date,
            time: time || "00:00",
            timeZone,
            assignedUserId: assigneeId || null,
            reminderLeadMinutes: Number(reminderLead) || 0,
          })} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`date-${targetId}`}>Date</Label>
              <Input
                id={`date-${targetId}`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`time-${targetId}`}>Time</Label>
              <Input
                id={`time-${targetId}`}
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`tz-${targetId}`}>Timezone</Label>
            <select
              id={`tz-${targetId}`}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            >
              {zones.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label} ({timeZoneOffsetLabel(zone.value)}) — {zone.value}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`reminder-${targetId}`}>Reminder</Label>
            <select
              id={`reminder-${targetId}`}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={reminderLead}
              onChange={(event) => setReminderLead(event.target.value)}
            >
              {REMINDER_LEAD_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {REMINDER_LEAD_LABELS[minutes]}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              A reminder appears in-app while you have the dashboard open. Nothing is published
              automatically.
            </p>
          </div>

          {assignees.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor={`assignee-${targetId}`}>Assignee</Label>
              <select
                id={`assignee-${targetId}`}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {assignees.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between">
            {initialDate ? (
              // Unscheduling is the same action with an empty schedule, so it
              // submits through this form rather than nesting a second one.
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={unschedule}
              >
                <Trash2 />
                Unschedule
              </Button>
            ) : (
              <span />
            )}
            <SubmitButton pendingLabel="Saving…">Save schedule</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
