import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";

import { requireSession } from "@/lib/auth/dal";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { CreateWorkspaceForm } from "@/app/onboarding/create-workspace-form";

export const metadata: Metadata = {
  title: "New workspace",
};

export default async function NewWorkspacePage() {
  const session = await requireSession();

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="bg-primary/10 text-primary mx-auto flex size-11 items-center justify-center rounded-xl">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Create a workspace</h1>
          <p className="text-muted-foreground text-sm">
            A separate workspace keeps its own team, profiles and posts.
          </p>
        </div>
        <CreateWorkspaceForm defaultTimezone={DEFAULT_TIMEZONE} />
        <p className="text-center text-sm">
          <Link href="/dashboard" className="font-medium underline underline-offset-4">
            <ArrowLeft className="mr-1 inline size-3.5" />
            Back to dashboard
          </Link>
        </p>
        <p className="text-muted-foreground text-center text-xs">
          Signed in as {session.user.email}
        </p>
      </div>
    </main>
  );
}
