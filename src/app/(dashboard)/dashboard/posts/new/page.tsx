import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PostEditor } from "@/components/posts/post-editor";
import { createPostAction } from "@/actions/posts";
import { assertPermission } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listAssignableMembers } from "@/lib/data/team";
import { listSelectableProfiles } from "@/lib/data/social-profiles";
import { listUnattachedMedia } from "@/lib/data/media";

export const metadata: Metadata = {
  title: "New post",
};

export default async function NewPostPage() {
  const context = await assertPermission(PERMISSIONS.postManage);

  const [profiles, members, media] = await Promise.all([
    listSelectableProfiles(),
    listAssignableMembers(),
    listUnattachedMedia(),
  ]);

  return (
    <>
      <PageHeader
        title="New post"
        description="Write the copy, choose the profiles it should be published on, and assign the work."
      />
      <PostEditor
        action={createPostAction}
        submitLabel="Create post"
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
        media={media.map((item) => ({ id: item.id, filename: item.filename }))}
        workspaceTimeZone={context.workspace.timezone}
      />
    </>
  );
}
