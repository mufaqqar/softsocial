import type { Metadata } from "next";
import { Send } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiStatus, PublishHistory } from "@/components/connections/publish-history";
import { getApiStatus, listPublishAttempts } from "@/lib/data/connections";
import { can, permissionsFor, PERMISSIONS } from "@/lib/auth/permissions";
import { requireWorkspace } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Publishing",
};

export default async function PublishingPage() {
  const context = await requireWorkspace();
  const permissions = permissionsFor(context.workspace.role);
  const [{ rows }, reports] = await Promise.all([
    listPublishAttempts({ take: 200 }),
    getApiStatus(),
  ]);

  return (
    <>
      <PageHeader
        title="Publishing"
        description="Every automatic publish attempt, and whether each provider is usable."
        icon={Send}
      />

      <Card>
        <CardHeader>
          <CardTitle>Publishing history</CardTitle>
          <CardDescription>
            One row per attempt, including the ones that failed and why. Retrying re-arms that
            single profile; a post that already went out is never sent twice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PublishHistory rows={rows} canRetry={can(permissions, PERMISSIONS.publishRetry)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API status</CardTitle>
          <CardDescription>
            What is configured on the server and which connections need attention. No secret values
            are shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiStatus reports={reports} />
        </CardContent>
      </Card>
    </>
  );
}
