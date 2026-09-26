"use client";

import { useActionState } from "react";

import { registerAction } from "@/actions/auth";
import { FieldError, FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, undefined);

  return (
    <Card>
      <CardContent>
        <FormFeedback state={state} />
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" autoComplete="name" required />
            <FieldError state={state} name="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            <FieldError state={state} name="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
            <p className="text-muted-foreground text-xs">
              At least 8 characters, including a letter and a number.
            </p>
            <FieldError state={state} name="password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspaceName">Workspace name (optional)</Label>
            <Input
              id="workspaceName"
              name="workspaceName"
              placeholder="IT Eksperts"
              autoComplete="organization"
            />
            <p className="text-muted-foreground text-xs">
              You become the owner. Leave it empty to set this up later.
            </p>
            <FieldError state={state} name="workspaceName" />
          </div>
          <SubmitButton className="w-full" pendingLabel="Creating account…">
            Create account
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
