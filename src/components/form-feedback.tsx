import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FormState } from "@/lib/form-state";

/** Renders the top-level error or success message returned by a Server Action. */
export function FormFeedback({ state }: { state: FormState }) {
  if (!state) {
    return null;
  }

  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }

  if (state.ok && state.message) {
    return (
      <Alert>
        <CheckCircle2 className="text-success" />
        <AlertTitle>Saved</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return null;
}

/** Renders per-field messages produced by Zod inside a Server Action. */
export function FieldError({ state, name }: { state: FormState; name: string }) {
  const messages = state?.fieldErrors?.[name];

  if (!messages || messages.length === 0) {
    return null;
  }

  return <p className="text-destructive text-sm">{messages[0]}</p>;
}
