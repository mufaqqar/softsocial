"use client";

import { useActionState, useId, useState } from "react";

import {
  createSocialProfileAction,
  updateSocialProfileAction,
} from "@/actions/social-profiles";
import { FieldError, FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/constants";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { SocialPlatform } from "@/generated/prisma/enums";

type ProfileDraft = {
  id?: string;
  platform: SocialPlatform;
  name: string;
  profileUrl: string;
  username: string;
  avatarUrl: string;
  description: string;
  notes: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  assignedUserId: string;
};

type Member = { userId: string; name: string };

/** Add / edit dialog for a manually tracked social profile. */
export function SocialProfileDialog({
  members,
  profile,
}: {
  members: Member[];
  profile?: ProfileDraft;
}) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(profile);

  // One dialog is rendered per profile row, so field ids must be unique per
  // instance or every label on the page would point at the first dialog.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fieldId = (field: string) => `${uid}-${field}`;

  const [state, formAction] = useActionState(
    editing ? updateSocialProfileAction : createSocialProfileAction,
    EMPTY_FORM_STATE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={editing ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
        {editing ? "Edit" : "Add profile"}
      </Button>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit profile" : "Add social profile"}</DialogTitle>
          <DialogDescription>
            Phase 1 records profiles manually. Nothing is connected to Facebook or LinkedIn yet.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {profile?.id ? (
            <input type="hidden" name="profileId" value={profile.id} />
          ) : null}

          <FormFeedback state={state} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fieldId("platform")}>Platform</Label>
              <select
                id={fieldId("platform")}
                name="platform"
                defaultValue={profile?.platform ?? "FACEBOOK"}
                className={inputClass}
              >
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {PLATFORM_LABELS[platform]}
                  </option>
                ))}
              </select>
              <FieldError state={state} name="platform" />
            </div>

            <div className="space-y-2">
              <Label htmlFor={fieldId("status")}>Status</Label>
              <select
                id={fieldId("status")}
                name="status"
                defaultValue={profile?.status ?? "ACTIVE"}
                className={inputClass}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("name")}>Profile name</Label>
            <Input
              id={fieldId("name")}
              name="name"
              defaultValue={profile?.name}
              placeholder="IT Eksperts"
              required
            />
            <FieldError state={state} name="name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("profileUrl")}>Profile URL</Label>
            <Input
              id={fieldId("profileUrl")}
              name="profileUrl"
              type="url"
              defaultValue={profile?.profileUrl ?? ""}
              placeholder="https://facebook.com/itexperts"
            />
            <FieldError state={state} name="profileUrl" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fieldId("username")}>Username</Label>
              <Input
                id={fieldId("username")}
                name="username"
                defaultValue={profile?.username ?? ""}
                placeholder="itexperts"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId("avatarUrl")}>Avatar URL</Label>
              <Input
                id={fieldId("avatarUrl")}
                name="avatarUrl"
                type="url"
                defaultValue={profile?.avatarUrl ?? ""}
              />
              <FieldError state={state} name="avatarUrl" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("description")}>Description</Label>
            <Input
              id={fieldId("description")}
              name="description"
              defaultValue={profile?.description ?? ""}
              placeholder="Main company page"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("notes")}>Notes</Label>
            <Textarea
              id={fieldId("notes")}
              name="notes"
              defaultValue={profile?.notes ?? ""}
              rows={3}
              placeholder="Tone, audience, anything the team should remember."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("assignedUserId")}>Default assignee</Label>
            <select
              id={fieldId("assignedUserId")}
              name="assignedUserId"
              defaultValue={profile?.assignedUserId ?? ""}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">
              {editing ? "Save changes" : "Add profile"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const inputClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";
