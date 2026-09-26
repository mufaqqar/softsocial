"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FieldError, FormFeedback } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  PHASE2_POST_STATUSES,
  POST_STATUS_LABELS,
  REMINDER_LEAD_MINUTES,
  REMINDER_LEAD_LABELS,
} from "@/lib/constants";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { parseHashtags } from "@/lib/validation/post";
import { COMMON_TIME_ZONES, timeZoneOffsetLabel } from "@/lib/time-zones";
import type { SocialPlatform } from "@/generated/prisma/enums";

export type MediaOption = {
  id: string;
  filename: string;
};

export type ProfileOption = {
  id: string;
  platform: SocialPlatform;
  name: string;
  username: string | null;
};

export type MemberOption = {
  userId: string;
  name: string;
};

/** One target's schedule, as the editor holds it while the form is being typed. */
export type TargetScheduleValue = {
  scheduledDate: string;
  scheduledTime: string;
  scheduledTimeZone: string;
  reminderLeadMinutes: number;
};

export type PostFormValue = {
  postId?: string;
  title: string;
  content: string;
  hashtags: string;
  notes: string;
  status: string;
  assignedUserId: string;
  variants: Record<SocialPlatform, string>;
  targetIds: string[];
  targetAssignees: Record<string, string>;
  targetSchedules: Record<string, TargetScheduleValue>;
  mediaIds: string[];
};

type EditorAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

/**
 * The post editor keeps its whole state in React and submits it as a single JSON
 * field, which the Server Action re-validates with `postSchema`.
 */
export function PostEditor({
  action,
  profiles,
  members,
  media,
  workspaceTimeZone,
  initial,
  submitLabel,
}: {
  action: EditorAction;
  profiles: ProfileOption[];
  members: MemberOption[];
  media: MediaOption[];
  workspaceTimeZone: string;
  initial?: PostFormValue;
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [hashtags, setHashtags] = useState(initial?.hashtags ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState(initial?.status ?? "DRAFT");
  const [assignedUserId, setAssignedUserId] = useState(initial?.assignedUserId ?? "");
  const [variants, setVariants] = useState<Record<SocialPlatform, string>>({
    FACEBOOK: initial?.variants.FACEBOOK ?? "",
    LINKEDIN: initial?.variants.LINKEDIN ?? "",
  });
  const [targetIds, setTargetIds] = useState<string[]>(initial?.targetIds ?? []);
  const [targetAssignees, setTargetAssignees] = useState<Record<string, string>>(
    initial?.targetAssignees ?? {},
  );
  const [targetSchedules, setTargetSchedules] = useState<Record<string, TargetScheduleValue>>(
    initial?.targetSchedules ?? {},
  );
  const [mediaIds, setMediaIds] = useState<string[]>(initial?.mediaIds ?? []);

  const grouped = useMemo(
    () =>
      PLATFORMS.map((platform) => ({
        platform,
        rows: profiles.filter((profile) => profile.platform === platform),
      })),
    [profiles],
  );

  const zones = COMMON_TIME_ZONES.some((zone) => zone.value === workspaceTimeZone)
    ? COMMON_TIME_ZONES
    : [
        { value: workspaceTimeZone, label: workspaceTimeZone, region: "Workspace" },
        ...COMMON_TIME_ZONES,
      ];

  /** Patching one field of a target's schedule keeps the rest of it intact. */
  function patchSchedule(
    socialProfileId: string,
    patch: Partial<TargetScheduleValue>,
  ) {
    setTargetSchedules((current) => {
      const existing = current[socialProfileId];

      return {
        ...current,
        [socialProfileId]: {
          scheduledDate: existing?.scheduledDate ?? "",
          scheduledTime: existing?.scheduledTime ?? "",
          scheduledTimeZone: existing?.scheduledTimeZone ?? workspaceTimeZone,
          reminderLeadMinutes: existing?.reminderLeadMinutes ?? 0,
          ...patch,
        },
      };
    });
  }

  const payload = {
    title,
    content,
    hashtags: parseHashtags(hashtags).join(" "),
    notes,
    status,
    assignedUserId: assignedUserId || undefined,
    variants: PLATFORMS.map((platform) => ({ platform, text: variants[platform] })),
    targets: targetIds.map((socialProfileId) => {
      const schedule = targetSchedules[socialProfileId];

      return {
        socialProfileId,
        assignedUserId: targetAssignees[socialProfileId] || assignedUserId || undefined,
        scheduledDate: schedule?.scheduledDate ?? "",
        scheduledTime: schedule?.scheduledTime ?? "",
        scheduledTimeZone: schedule?.scheduledTimeZone ?? workspaceTimeZone,
        reminderLeadMinutes: schedule?.reminderLeadMinutes ?? 0,
      };
    }),
    mediaIds,
  };

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {initial?.postId ? <input type="hidden" name="postId" value={initial.postId} /> : null}

      <FormFeedback state={state} />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Content</h2>

        <Field label="Title" htmlFor="title">
          <input
            id="title"
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="AI Chatbot Promotion"
            maxLength={160}
          />
        </Field>

        <Field label="Default copy" htmlFor="content">
          <textarea
            id="content"
            className={`${inputClass} min-h-32 py-2`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Used for any platform without dedicated copy."
            maxLength={20000}
          />
        </Field>
        <FieldError state={state} name="content" />

        <Field label="Hashtags" htmlFor="hashtags">
          <input
            id="hashtags"
            className={inputClass}
            value={hashtags}
            onChange={(event) => setHashtags(event.target.value)}
            placeholder="#chatbot #ai #marketing"
          />
        </Field>

        <Field label="Internal notes" htmlFor="notes">
          <textarea
            id="notes"
            className={`${inputClass} min-h-20 py-2`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Only visible to your team."
            maxLength={2000}
          />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Platform copy</h2>
        <p className="text-muted-foreground text-xs">
          Optional. A blank platform falls back to the default copy above.
        </p>
        {PLATFORMS.map((platform) => (
          <Field key={platform} label={PLATFORM_LABELS[platform]} htmlFor={`variant-${platform}`}>
            <textarea
              id={`variant-${platform}`}
              className={`${inputClass} min-h-24 py-2`}
              value={variants[platform]}
              onChange={(event) =>
                setVariants((current) => ({ ...current, [platform]: event.target.value }))
              }
              maxLength={20000}
            />
          </Field>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Publish targets</h2>
        <p className="text-muted-foreground text-xs">
          One task is created per selected profile. Give each one its own date and time, or leave
          them blank to leave it unscheduled. Every assignee publishes by hand.
        </p>

        <Field label="Default assignee" htmlFor="assignedUserId">
          <select
            id="assignedUserId"
            className={inputClass}
            value={assignedUserId}
            onChange={(event) => setAssignedUserId(event.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>

        {profiles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No social profiles yet. Add one on the Social Profiles page first.
          </p>
        ) : null}

        {grouped.map((group) => (
          <div key={group.platform} className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {PLATFORM_LABELS[group.platform]}
            </p>

            {group.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No {PLATFORM_LABELS[group.platform]} profiles yet.
              </p>
            ) : (
              group.rows.map((profile) => {
                const selected = targetIds.includes(profile.id);
                const schedule = targetSchedules[profile.id];

                return (
                  <div
                    key={profile.id}
                    className="space-y-3 rounded-md border px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            setTargetIds((current) =>
                              current.includes(profile.id)
                                ? current.filter((id) => id !== profile.id)
                                : [...current, profile.id],
                            )
                          }
                        />
                        <span className="truncate">{profile.name}</span>
                        {profile.username ? (
                          <span className="text-muted-foreground truncate text-xs">
                            @{profile.username}
                          </span>
                        ) : null}
                      </label>

                      {selected && members.length > 0 ? (
                        <select
                          aria-label={`Assignee for ${profile.name}`}
                          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                          value={targetAssignees[profile.id] ?? assignedUserId}
                          onChange={(event) =>
                            setTargetAssignees((current) => ({
                              ...current,
                              [profile.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Use default assignee</option>
                          {members.map((member) => (
                            <option key={member.userId} value={member.userId}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>

                    {selected ? (
                      <div className="grid gap-2 sm:grid-cols-4">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`date-${profile.id}`}
                            className="text-muted-foreground text-xs"
                          >
                            Date
                          </Label>
                          <input
                            id={`date-${profile.id}`}
                            type="date"
                            aria-label={`Schedule date for ${profile.name}`}
                            className={smallInputClass}
                            value={schedule?.scheduledDate ?? ""}
                            onChange={(event) =>
                              patchSchedule(profile.id, { scheduledDate: event.target.value })
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor={`time-${profile.id}`}
                            className="text-muted-foreground text-xs"
                          >
                            Time
                          </Label>
                          <input
                            id={`time-${profile.id}`}
                            type="time"
                            aria-label={`Schedule time for ${profile.name}`}
                            className={smallInputClass}
                            value={schedule?.scheduledTime ?? ""}
                            onChange={(event) =>
                              patchSchedule(profile.id, { scheduledTime: event.target.value })
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor={`tz-${profile.id}`}
                            className="text-muted-foreground text-xs"
                          >
                            Timezone
                          </Label>
                          <select
                            id={`tz-${profile.id}`}
                            aria-label={`Schedule timezone for ${profile.name}`}
                            className={smallInputClass}
                            value={schedule?.scheduledTimeZone ?? workspaceTimeZone}
                            onChange={(event) =>
                              patchSchedule(profile.id, {
                                scheduledTimeZone: event.target.value,
                              })
                            }
                          >
                            {zones.map((zone) => (
                              <option key={zone.value} value={zone.value}>
                                {zone.label} ({timeZoneOffsetLabel(zone.value)})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor={`reminder-${profile.id}`}
                            className="text-muted-foreground text-xs"
                          >
                            Reminder
                          </Label>
                          <select
                            id={`reminder-${profile.id}`}
                            aria-label={`Reminder for ${profile.name}`}
                            className={smallInputClass}
                            value={String(schedule?.reminderLeadMinutes ?? 0)}
                            onChange={(event) =>
                              patchSchedule(profile.id, {
                                reminderLeadMinutes: Number(event.target.value),
                              })
                            }
                          >
                            {REMINDER_LEAD_MINUTES.map((minutes) => (
                              <option key={minutes} value={minutes}>
                                {REMINDER_LEAD_LABELS[minutes]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Media</h2>

        {media.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            The media library is empty.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => router.push("/dashboard/media")}
            >
              Upload a file
            </button>
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {media.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={mediaIds.includes(item.id)}
                  onChange={() =>
                    setMediaIds((current) =>
                      current.includes(item.id)
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id],
                    )
                  }
                />
                <span className="truncate">{item.filename}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-sm font-semibold">Status</h2>
        <select
          className={inputClass}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {PHASE2_POST_STATUSES.filter((value) => value !== "SCHEDULED").map((value) => (
            <option key={value} value={value}>
              {POST_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          &ldquo;Awaiting manual publishing&rdquo; hands the targets to your team. The post is marked
          completed automatically once every target is completed, and reads as{" "}
          {POST_STATUS_LABELS.SCHEDULED} while every outstanding target is still in the future.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

const inputClass =
  "border-input bg-background w-full rounded-md border px-3 text-sm h-9 disabled:opacity-50";

const smallInputClass =
  "border-input bg-background h-8 w-full rounded-md border px-2 text-xs disabled:opacity-50";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
