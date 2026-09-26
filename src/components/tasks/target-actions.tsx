"use client";

import { useActionState } from "react";

import { setTargetNoteAction, setTargetStatusAction } from "@/actions/posts";
import { FieldError, FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PostTargetStatus } from "@/generated/prisma/enums";

type StatusButton = {
  status: PostTargetStatus;
  label: string;
  variant: "default" | "outline" | "destructive";
};

const MEMBER_OPTIONS: StatusButton[] = [
  { status: "IN_PROGRESS", label: "Start publishing", variant: "outline" },
  { status: "COMPLETED", label: "Mark completed", variant: "default" },
];

const MANAGER_OPTIONS: StatusButton[] = [
  { status: "PENDING", label: "Reset to pending", variant: "outline" },
  { status: "IN_PROGRESS", label: "In progress", variant: "outline" },
  { status: "COMPLETED", label: "Completed", variant: "default" },
  { status: "FAILED", label: "Failed", variant: "outline" },
  { status: "CANCELLED", label: "Cancelled", variant: "destructive" },
];

/**
 * The manual publishing controls for one profile. A member only sees the two
 * transitions their role allows; owners and admins see the full set.
 */
export function TargetActions({
  targetId,
  status,
  notes,
  canManageAny,
}: {
  targetId: string;
  status: PostTargetStatus;
  notes: string | null;
  canManageAny: boolean;
}) {
  const [statusState, statusAction] = useActionState(setTargetStatusAction, undefined);
  const [noteState, noteAction] = useActionState(setTargetNoteAction, undefined);

  const options = canManageAny ? MANAGER_OPTIONS : MEMBER_OPTIONS;
  const finished = status === "COMPLETED";

  return (
    <div className="space-y-3">
      <FormFeedback state={statusState} />

      <div className="flex flex-wrap gap-2">
        {options
          .filter((option) => option.status !== status)
          .map((option) => (
            <form key={option.status} action={statusAction}>
              <input type="hidden" name="targetId" value={targetId} />
              <input type="hidden" name="status" value={option.status} />
              <Button
                type="submit"
                size="sm"
                variant={finished && option.status === "COMPLETED" ? "outline" : option.variant}
                disabled={Boolean(statusState?.error)}
              >
                {option.label}
              </Button>
            </form>
          ))}
      </div>

      <FieldError state={statusState} name="status" />

      <form action={noteAction} className="space-y-2">
        <input type="hidden" name="targetId" value={targetId} />
        <Label htmlFor={`notes-${targetId}`} className="text-xs text-muted-foreground">
          Publishing note (optional)
        </Label>
        <div className="flex gap-2">
          <Input
            id={`notes-${targetId}`}
            name="notes"
            defaultValue={notes ?? ""}
            placeholder="Posted at 3pm, link in chat"
            maxLength={2000}
          />
          <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
        <FieldError state={noteState} name="notes" />
        {noteState?.ok && noteState.message ? (
          <p className="text-success text-xs">{noteState.message}</p>
        ) : null}
      </form>
    </div>
  );
}
