"use client";

import { useActionState, useState } from "react";

import { createWorkspaceAction } from "@/actions/auth";
import { FieldError, FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COMMON_TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export function CreateWorkspaceForm({ defaultTimezone }: { defaultTimezone: string }) {
  const [state, formAction] = useActionState(createWorkspaceAction, undefined);
  const [timezone, setTimezone] = useState(defaultTimezone);

  return (
    <Card>
      <CardContent>
        <FormFeedback state={state} />
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workspace name</Label>
            <Input id="name" name="name" placeholder="IT Eksperts" required autoFocus />
            <FieldError state={state} name="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Workspace URL</Label>
            <Input id="slug" name="slug" placeholder="it-eksperts" pattern="[a-z0-9-]+" />
            <p className="text-muted-foreground text-xs">
              Optional. Lowercase letters, numbers and dashes.
            </p>
            <FieldError state={state} name="slug" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {COMMON_TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <FieldError state={state} name="timezone" />
          </div>
          <SubmitButton className="w-full" pendingLabel="Creating workspace…">
            Create workspace
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
