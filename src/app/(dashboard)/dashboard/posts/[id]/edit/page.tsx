import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updatePostAction } from "@/actions/posts";
import { PageHeader } from "@/components/page-header";
import { PostEditor, type PostFormValue } from "@/components/posts/post-editor";
import { assertPermission } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getPost } from "@/lib/data/posts";
import { listSelectableProfiles } from "@/lib/data/social-profiles";
import { listUnattachedMedia } from "@/lib/data/media";
import { listAssignableMembers } from "@/lib/data/team";
import { dateKeyOf, timeKeyOf } from "@/lib/scheduling";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Edit post",
};

export default async function EditPostPage({ params }: PageProps<"/dashboard/posts/[id]/edit">) {
  const context = await assertPermission(PERMISSIONS.postManage);

  const { id } = await params;
  const post = await getPost(id);

  if (!post) {
    notFound();
  }

  // Media already attached to this post must stay selectable.
  const [profiles, members, unattached, attached] = await Promise.all([
    listSelectableProfiles(),
    listAssignableMembers(),
    listUnattachedMedia(),
    prisma.postMedia.findMany({
      where: { postId: post.id },
      orderBy: { position: "asc" },
      select: { media: { select: { id: true, filename: true } } },
    }),
  ]);

  const timeZone = context.workspace.timezone;

  const initial: PostFormValue = {
    postId: post.id,
    title: post.title ?? "",
    content: post.content,
    hashtags: post.hashtags.join(" "),
    notes: post.notes ?? "",
    status: post.status,
    assignedUserId: post.assignedUserId ?? "",
    variants: {
      FACEBOOK: post.variants.find((v) => v.platform === "FACEBOOK")?.text ?? "",
      LINKEDIN: post.variants.find((v) => v.platform === "LINKEDIN")?.text ?? "",
    },
    targetIds: post.targets.map((target) => target.socialProfileId),
    targetAssignees: Object.fromEntries(
      post.targets
        .filter((target) => target.assignedUserId)
        .map((target) => [target.socialProfileId, target.assignedUserId as string]),
    ),
    // An existing schedule is read back into wall date and wall time in the zone
    // it was stored with, so editing a post never silently shifts a task to a
    // neighbouring day. The same zone is sent back on save.
    targetSchedules: Object.fromEntries(
      post.targets
        .filter((target) => target.scheduledAt)
        .map((target) => {
          const zone = target.timezone ?? timeZone;

          return [
            target.socialProfileId,
            {
              scheduledDate: dateKeyOf(target.scheduledAt!, zone),
              scheduledTime: timeKeyOf(target.scheduledAt!, zone),
              scheduledTimeZone: zone,
              reminderLeadMinutes: target.reminderAt
                ? Math.max(
                    0,
                    Math.round(
                      (target.scheduledAt!.getTime() - target.reminderAt.getTime()) / 60_000,
                    ),
                  )
                : 0,
            },
          ];
        }),
    ),
    mediaIds: attached.map((link) => link.media.id),
  };

  const media = attached
    .map((link) => link.media)
    .concat(unattached)
    .reduce<{ id: string; filename: string }[]>((accumulator, item) => {
      if (!accumulator.some((existing) => existing.id === item.id)) {
        accumulator.push(item);
      }

      return accumulator;
    }, []);

  return (
    <>
      <PageHeader
        title="Edit post"
        description="Changes apply immediately. Completed targets are never removed."
      />
      <PostEditor
        action={updatePostAction}
        submitLabel="Save changes"
        initial={initial}
        profiles={profiles.map((profile) => ({
          id: profile.id,
          platform: profile.platform,
          name: profile.name,
          username: profile.username,
        }))}
        members={members.map((member) => ({
          userId: member.userId,
          name: member.user.name,
        }))}
        media={media}
        workspaceTimeZone={timeZone}
      />
    </>
  );
}
