/**
 * Shared shape returned by every Server Action so forms can consume the result
 * with `useActionState` without redefining the type.
 */
export type FormState =
  | {
      ok?: boolean;
      error?: string;
      /** Field name -> messages, produced from a Zod failure. */
      fieldErrors?: Record<string, string[] | undefined>;
      /** Message shown at the top of the form. */
      message?: string;
      /** Returned by actions that create a row so the form can follow up. */
      mediaId?: string;
    }
  | undefined;

export const EMPTY_FORM_STATE: FormState = undefined;

export function formError(error: unknown): { error: string } {
  if (error instanceof Error) {
    return { error: error.message };
  }

  return { error: "Something went wrong. Please try again." };
}
