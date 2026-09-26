"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  SCHEDULE_FILTER_STATUSES,
  TARGET_STATUS_LABELS,
} from "@/lib/constants";
import { timeZoneOffsetLabel } from "@/lib/time-zones";

export type MemberFilterOption = { userId: string; name: string };
export type ProfileFilterOption = { id: string; name: string; platform: string };

/**
 * master.txt 2.5. The filter state lives in the URL rather than in React state
 * so a filtered calendar can be linked to and survives a refresh, which is the
 * only thing that makes a shared calendar useful.
 */
export function CalendarFilters({
  members,
  profiles,
  timeZone,
}: {
  members: MemberFilterOption[];
  profiles: ProfileFilterOption[];
  timeZone: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const assignedUserId = params.get("assignedUserId") ?? "";
  const platform = params.get("platform") ?? "";
  const socialProfileId = params.get("socialProfileId") ?? "";
  const status = params.get("status") ?? "";

  const active =
    assignedUserId !== "" || platform !== "" || socialProfileId !== "" || status !== "";

  /**
   * One navigation per change. Two `router.replace` calls in a row would each be
   * built from the same `params` snapshot, so the second could land first and the
   * first would then erase it.
   */
  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(patch)) {
      if (value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false });
    });
  }

  function clear() {
    const next = new URLSearchParams(params.toString());

    for (const key of ["assignedUserId", "platform", "socialProfileId", "status"]) {
      next.delete(key);
    }

    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false });
    });
  }

  const selectClass =
    "border-input bg-background h-9 rounded-md border px-2 text-sm disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <span className="text-muted-foreground flex items-center gap-1.5 pb-2 text-xs font-medium">
          <Filter className="size-3.5" />
          Filters
        </span>

        {members.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="filter-assignee" className="text-muted-foreground text-xs">
              Assignee
            </Label>
            <select
              id="filter-assignee"
              className={selectClass}
              value={assignedUserId}
              disabled={pending}
              onChange={(event) => update({ assignedUserId: event.target.value })}
            >
              <option value="">Everyone</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="filter-platform" className="text-muted-foreground text-xs">
            Platform
          </Label>
          <select
            id="filter-platform"
            className={selectClass}
            value={platform}
            disabled={pending}
            onChange={(event) => {
              // A profile from another platform would contradict the platform
              // filter, so changing one clears the other in the same navigation.
              update({ socialProfileId: "", platform: event.target.value });
            }}
          >
            <option value="">All platforms</option>
            {PLATFORMS.map((value) => (
              <option key={value} value={value}>
                {PLATFORM_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {profiles.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="filter-profile" className="text-muted-foreground text-xs">
              Profile
            </Label>
            <select
              id="filter-profile"
              className={selectClass}
              value={socialProfileId}
              disabled={pending}
              onChange={(event) => {
                const value = event.target.value;
                const chosen = profiles.find((profile) => profile.id === value);
                update({
                  platform: value ? (chosen?.platform ?? "") : "",
                  socialProfileId: value,
                });
              }}
            >
              <option value="">All profiles</option>
              {profiles
                .filter((profile) => platform === "" || profile.platform === platform)
                .map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="filter-status" className="text-muted-foreground text-xs">
            Status
          </Label>
          <select
            id="filter-status"
            className={selectClass}
            value={status}
            disabled={pending}
            onChange={(event) => update({ status: event.target.value })}
          >
            <option value="">Any status</option>
            {SCHEDULE_FILTER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {TARGET_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {active ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={pending}>
            <X />
            Clear
          </Button>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">
        Everything is bucketed and shown in {timeZone} ({timeZoneOffsetLabel(timeZone)}). Opening a
        schedule shows the wall time it was typed in, together with that timezone.
      </p>
    </div>
  );
}
