"use client";

import { useActionState } from "react";

import { changeOwnPasswordAction, updateOwnProfileAction } from "@/actions/team";
import { updateWorkspaceAction } from "@/actions/workspace";
import { FieldError, FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

const inputClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

export function ProfileForm({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [state, formAction] = useActionState(updateOwnProfileAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback state={state} />

      <div className="space-y-2">
        <Label htmlFor="profile-name">Full name</Label>
        <Input id="profile-name" name="name" defaultValue={name} required />
        <FieldError state={state} name="name" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" name="email" type="email" defaultValue={email} required />
        <FieldError state={state} name="email" />
      </div>

      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(changeOwnPasswordAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback state={state} />

      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required />
        <FieldError state={state} name="currentPassword" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" required />
        <p className="text-muted-foreground text-xs">
          At least 8 characters, including a letter and a number.
        </p>
        <FieldError state={state} name="newPassword" />
      </div>

      <SubmitButton pendingLabel="Updating…">Change password</SubmitButton>
    </form>
  );
}

const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export function WorkspaceForm({
  name,
  slug,
  timezone,
  disabled,
}: {
  name: string;
  slug: string;
  timezone: string;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(updateWorkspaceAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <FormFeedback state={state} />

      <div className="space-y-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input id="workspace-name" name="name" defaultValue={name} required disabled={disabled} />
        <FieldError state={state} name="name" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workspace-slug">Workspace URL</Label>
        <Input id="workspace-slug" value={slug} readOnly disabled />
        <p className="text-muted-foreground text-xs">The URL cannot be changed.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workspace-timezone">Timezone</Label>
        <select
          id="workspace-timezone"
          name="timezone"
          defaultValue={timezone}
          className={inputClass}
          disabled={disabled}
        >
          {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <FieldError state={state} name="timezone" />
      </div>

      <SubmitButton pendingLabel="Saving…" disabled={disabled}>
        Save workspace
      </SubmitButton>
    </form>
  );
}
