import type { Metadata } from "next";
import Link from "next/link";
import { Link2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionsPanel } from "@/components/connections/connections-panel";
import { listConnections } from "@/lib/data/connections";
import { can, permissionsFor, PERMISSIONS } from "@/lib/auth/permissions";
import { requireWorkspace } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Connections",
};

/**
 * master.txt 3.15. Reads the `notice` the OAuth callback redirected with, so a
 * member always lands back here with an explanation of what happened.
 */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ notice }, context, connections] = await Promise.all([
    searchParams,
    requireWorkspace(),
    listConnections(),
  ]);

  const permissions = permissionsFor(context.workspace.role);

  return (
    <>
      <PageHeader
        title="Connections"
        description="Connect the Facebook Pages and LinkedIn organisation pages this workspace publishes to."
        icon={Link2}
      />

      {notice ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>
            Tokens are encrypted at rest and never shown in full. A Facebook Page is offered for
            automatic publishing only if the connected account can post to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionsPanel
            connections={connections}
            canManage={can(permissions, PERMISSIONS.connectionManage)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adding an account later</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            Profiles created before a Page was connected keep working: link them from{" "}
            <Link href="/dashboard/social-profiles" className="text-primary underline">
              Social Profiles
            </Link>{" "}
            so their scheduled posts can publish automatically instead of being held for a person.
          </p>
          <p>
            A post already marked as published is never re-sent, even if you reconnect the account
            or retry the post.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
