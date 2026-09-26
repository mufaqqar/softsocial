"use client";

import { useActionState, useState } from "react";

import { addMemberAction, updateMemberAction } from "@/actions/team";
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
import { ASSIGNABLE_ROLES } from "@/lib/auth/permissions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { MemberStatus, WorkspaceRole } from "@/generated/prisma/enums";

export type MemberDraft = {
  memberId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: MemberStatus;
  isSelf: boolean;
};

const inputClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

/** Add member dialog. Owners are never listed because ownership is transferred. */
export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addMemberAction, EMPTY_FORM_STATE);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        Add member
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>
            If the email already has an account, the person is simply added to this workspace.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <FormFeedback state={state} />

          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required />
            <FieldError state={state} name="name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
            <FieldError state={state} name="email" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select id="role" name="role" defaultValue="MEMBER" className={inputClass}>
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0) + role.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <FieldError state={state} name="role" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Temporary password</Label>
            <Input
              id="password"
              name="password"
              type="text"
              placeholder="Only needed for a brand new account"
            />
            <p className="text-muted-foreground text-xs">
              At least 8 characters with a letter and a number. Share it with the new member.
            </p>
            <FieldError state={state} name="password" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Adding…">Add member</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditMemberDialog({ member }: { member: MemberDraft }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateMemberAction, EMPTY_FORM_STATE);

  const isOwner = member.role === "OWNER";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {member.name}</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "The workspace owner is fixed for the life of the workspace, so their role and access cannot be changed here."
              : "Change their name, role or access."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="memberId" value={member.memberId} />
          <FormFeedback state={state} />

          <div className="space-y-2">
            <Label htmlFor={`name-${member.memberId}`}>Full name</Label>
            <Input
              id={`name-${member.memberId}`}
              name="name"
              defaultValue={member.name}
              required
              disabled={isOwner}
            />
            <FieldError state={state} name="name" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`role-${member.memberId}`}>Role</Label>
              <select
                id={`role-${member.memberId}`}
                name="role"
                defaultValue={member.role}
                className={inputClass}
                disabled={isOwner || member.isSelf}
              >
                {ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.charAt(0) + role.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`status-${member.memberId}`}>Access</Label>
              <select
                id={`status-${member.memberId}`}
                name="status"
                defaultValue={member.status}
                className={inputClass}
                disabled={isOwner || member.isSelf}
              >
                <option value="ACTIVE">Active</option>
                <option value="INVITED">Invited</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="REMOVED">Removed</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
