import type { Metadata } from "next";
import { Share2, Trash2 } from "lucide-react";

import { removeSocialProfileAction } from "@/actions/social-profiles";
import { EmptyState, PageHeader } from "@/components/page-header";
import { SocialProfileDialog } from "@/components/profiles/social-profile-dialog";
import { PlatformBadge, ProfileStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { listSocialProfiles } from "@/lib/data/social-profiles";
import { listAssignableMembers } from "@/lib/data/team";
import { formatDate } from "@/lib/format";
import { socialProfileFilterSchema } from "@/lib/validation/social-profile";

export const metadata: Metadata = {
  title: "Social Profiles",
};

export default async function SocialProfilesPage({
  searchParams,
}: PageProps<"/dashboard/social-profiles">) {
  const context = await requireWorkspace();
  const params = await searchParams;

  const filter = socialProfileFilterSchema.parse({
    platform: typeof params.platform === "string" ? params.platform : undefined,
    status: typeof params.status === "string" ? params.status : undefined,
    q: typeof params.q === "string" ? params.q : undefined,
  });

  const [profiles, members] = await Promise.all([
    listSocialProfiles(filter),
    listAssignableMembers(),
  ]);

  const canManage = can(context.permissions, PERMISSIONS.profileManage);
  const memberOptions = members.map((member) => ({
    userId: member.userId,
    name: member.user.name,
  }));

  return (
    <>
      <PageHeader
        title="Social Profiles"
        description="The Facebook pages and LinkedIn pages your team publishes to. Added manually in Phase 1."
        icon={Share2}
        actions={
          canManage ? <SocialProfileDialog members={memberOptions} /> : null
        }
      />

      <form className="flex flex-wrap gap-2" action="/dashboard/social-profiles">
        <Input
          name="q"
          defaultValue={filter.q ?? ""}
          placeholder="Search name or username"
          className="max-w-xs"
        />
        <select
          name="platform"
          defaultValue={filter.platform ?? ""}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">All platforms</option>
          <option value="FACEBOOK">Facebook</option>
          <option value="LINKEDIN">LinkedIn</option>
        </select>
        <select
          name="status"
          defaultValue={filter.status ?? ""}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Share2}
          title="No social profiles yet"
          description="Add the Facebook and LinkedIn profiles your team publishes to."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <Card className="h-full">
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformBadge platform={profile.platform} />
                    <ProfileStatusBadge status={profile.status} />
                    {profile.linked ? (
                      <span className="text-muted-foreground text-xs">Linked (Phase 3)</span>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    {profile.profileUrl ? (
                      <a
                        href={profile.profileUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium hover:underline"
                      >
                        {profile.name}
                      </a>
                    ) : (
                      <p className="font-medium">{profile.name}</p>
                    )}
                    {profile.username ? (
                      <p className="text-muted-foreground text-xs">@{profile.username}</p>
                    ) : null}
                    {profile.description ? (
                      <p className="text-muted-foreground text-sm">{profile.description}</p>
                    ) : null}
                  </div>

                  {profile.notes ? (
                    <p className="bg-muted/40 rounded-md border p-3 text-sm whitespace-pre-wrap">
                      {profile.notes}
                    </p>
                  ) : null}

                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>
                      {profile.postCount} post target{profile.postCount === 1 ? "" : "s"}
                    </span>
                    {profile.assignedUserName ? (
                      <span>Default: {profile.assignedUserName}</span>
                    ) : null}
                    <span>Added {formatDate(profile.createdAt)}</span>
                  </div>

                  {canManage ? (
                    <div className="flex items-center gap-2 border-t pt-3">
                      <SocialProfileDialog
                        members={memberOptions}
                        profile={{
                          id: profile.id,
                          platform: profile.platform,
                          name: profile.name,
                          profileUrl: profile.profileUrl ?? "",
                          username: profile.username ?? "",
                          avatarUrl: profile.avatarUrl ?? "",
                          description: profile.description ?? "",
                          notes: profile.notes ?? "",
                          status:
                            profile.status === "ARCHIVED" ? "ARCHIVED" : profile.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
                          assignedUserId: profile.assignedUserId ?? "",
                        }}
                      />
                      <form action={removeSocialProfileAction} className="ml-auto">
                        <input type="hidden" name="profileId" value={profile.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                        >
                          <Trash2 />
                          Remove
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-xs">
        Removing a profile that is used by a post archives it instead, so publishing history stays
        intact.
      </p>
    </>
  );
}
