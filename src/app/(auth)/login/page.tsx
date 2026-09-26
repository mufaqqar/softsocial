import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { getSession } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const session = await getSession();

  if (session) {
    redirect(session.workspaces.length > 0 ? "/dashboard" : "/onboarding");
  }

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="bg-primary/10 text-primary mx-auto flex size-11 items-center justify-center rounded-xl">
            <Layers className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to SoftSocial</h1>
          <p className="text-muted-foreground text-sm">
            Manage Facebook and LinkedIn content with your team.
          </p>
        </div>
        <LoginForm next={next} />
        <p className="text-muted-foreground text-center text-sm">
          Need an account?{" "}
          <Link href="/register" className="font-medium underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
