import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { getSession } from "@/lib/auth/dal";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { CreateWorkspaceForm } from "./create-workspace-form";

export const metadata: Metadata = {
  title: "Create your workspace",
};

export default async function OnboardingPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.workspaces.length > 0) {
    redirect("/dashboard");
  }

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="bg-primary/10 text-primary mx-auto flex size-11 items-center justify-center rounded-xl">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome, {session.user.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm">
            Create the workspace your team will share. You will be its owner.
          </p>
        </div>
        <CreateWorkspaceForm defaultTimezone={DEFAULT_TIMEZONE} />
      </div>
    </main>
  );
}
