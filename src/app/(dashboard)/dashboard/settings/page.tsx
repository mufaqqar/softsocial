import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  PasswordForm,
  ProfileForm,
  WorkspaceForm,
} from "@/components/settings/settings-forms";
import { SectionCard } from "@/components/stat-card";
import { RoleBadge } from "@/components/status-badges";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const context = await requireWorkspace();
  const canManageWorkspace = can(context.permissions, PERMISSIONS.workspaceManage);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account and this workspace's configuration."
        icon={Settings}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Your profile" description="How you appear to the rest of the team.">
          <ProfileForm name={context.user.name} email={context.user.email} />
        </SectionCard>

        <SectionCard title="Password" description="Choose something you do not use elsewhere.">
          <PasswordForm />
        </SectionCard>

        <SectionCard
          title="Workspace"
          description="Shared by everyone in this workspace."
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Your role here is <RoleBadge role={context.workspace.role} />.
              {context.workspace.role === "OWNER"
                ? " You can change these settings."
                : " Only the owner can change these settings."}
            </p>
            <WorkspaceForm
              name={context.workspace.name}
              slug={context.workspace.slug}
              timezone={context.workspace.timezone}
              disabled={!canManageWorkspace}
            />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
