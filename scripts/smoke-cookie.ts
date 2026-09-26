/**
 * Prints a ready-to-use Cookie header for a seeded account so the running app
 * can be smoke-tested over plain HTTP (no browser required).
 *
 * It mints a real Session row and signs the real session cookie, so anything
 * the request reaches is protected by exactly the production auth path.
 *
 * Usage:
 *   npx tsx scripts/smoke-cookie.ts mufaqar@softsocial.dev
 */
import "dotenv/config";

import { encryptSession } from "@/lib/auth/token";
import { SESSION_COOKIE, WORKSPACE_COOKIE } from "@/lib/auth/constants";
import { prisma } from "./prisma";

const email = process.argv[2] ?? "mufaqar@softsocial.dev";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      memberships: {
        where: { status: "ACTIVE", workspace: { deletedAt: null } },
        select: { workspace: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    throw new Error(`No user with email ${email}. Run npm run db:seed first.`);
  }

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userAgent: "smoke-test",
    },
    select: { id: true },
  });

  const token = await encryptSession({ sid: session.id, uid: user.id });
  const workspace = user.memberships[0]?.workspace;

  const cookies = [
    `${SESSION_COOKIE}=${token}`,
    ...(workspace ? [`${WORKSPACE_COOKIE}=${workspace.id}`] : []),
  ].join("; ");

  console.log(
    JSON.stringify(
      {
        email: user.email,
        name: user.name,
        workspace: workspace?.name ?? null,
        workspaceId: workspace?.id ?? null,
        sessionId: session.id,
        cookie: cookies,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
