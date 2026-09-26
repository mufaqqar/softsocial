import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/dal";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  redirect(session.workspaces.length > 0 ? "/dashboard" : "/onboarding");
}
