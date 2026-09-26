"use client";

import { useActionState, useEffect, useRef } from "react";

import { uploadMediaAction } from "@/actions/media";
import { FieldError, FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALLOWED_MEDIA_TYPES, MAX_MEDIA_BYTES } from "@/lib/constants";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { formatBytes } from "@/lib/format";

/** Uploads one image at a time. Resets the fields after a successful upload. */
export function MediaUploader() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(uploadMediaAction, EMPTY_FORM_STATE);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <FormFeedback state={state} />

      <div className="space-y-2">
        <Label htmlFor="file">Image</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept={Object.keys(ALLOWED_MEDIA_TYPES).join(",")}
          required
        />
        <p className="text-muted-foreground text-xs">
          {Object.keys(ALLOWED_MEDIA_TYPES).join(", ")} · up to {formatBytes(MAX_MEDIA_BYTES)} per
          file.
        </p>
        <FieldError state={state} name="file" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="altText">Alt text</Label>
        <Input id="altText" name="altText" placeholder="Describe the image" />
        <FieldError state={state} name="altText" />
      </div>

      <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
    </form>
  );
}
