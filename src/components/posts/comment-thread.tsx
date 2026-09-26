"use client";

import { useActionState } from "react";

import { addCommentAction } from "@/actions/posts";
import { FieldError, FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { formatDateTime, initials } from "@/lib/format";

type Comment = {
  id: string;
  content: string;
  createdAt: Date;
  authorName: string;
};

export function CommentThread({
  postId,
  comments,
  canComment,
}: {
  postId: string;
  comments: Comment[];
  canComment: boolean;
}) {
  const [state, formAction] = useActionState(addCommentAction, EMPTY_FORM_STATE);

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">
                  {initials(comment.authorName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm">
                  <span className="font-medium">{comment.authorName}</span>{" "}
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(comment.createdAt)}
                  </span>
                </p>
                <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="postId" value={postId} />
          <FormFeedback state={state} />
          <Textarea
            name="content"
            placeholder="Add a comment for the team…"
            rows={3}
            maxLength={2000}
            required
          />
          <FieldError state={state} name="content" />
          <SubmitButton size="sm" pendingLabel="Posting…">
            Add comment
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
