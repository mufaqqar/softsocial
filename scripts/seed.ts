/**
 * Seeds the Phase 1 acceptance data from master.txt section 20:
 *
 *   workspace  IT Eksperts
 *   members    Mufaqar (owner), Ahmed, Ali (admin), Sara
 *   profiles   Facebook - IT Eksperts / CrimeCaseHub / MoneyMuse / WC Pulse
 *              LinkedIn  - IT Eksperts / Client ABC
 *   post       AI Chatbot Promotion, Facebook + LinkedIn copy, one image
 *   targets    FB IT Eksperts, FB MoneyMuse, FB WC Pulse, LI IT Eksperts
 *   state      3 of 4 targets completed, 1 pending, assigned to Ahmed
 *
 * The script is idempotent: re-running it updates the same rows.
 *
 * Usage: npm run db:seed
 */
import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { hashPassword } from "@/lib/auth/password";
import { slugify } from "@/lib/slug";
import { prisma } from "./prisma";

const PASSWORD = "Softsocial123";

const PEOPLE = [
  { name: "Mufaqar", email: "mufaqar@softsocial.dev", role: "OWNER" },
  { name: "Ahmed", email: "ahmed@softsocial.dev", role: "MEMBER" },
  { name: "Ali", email: "ali@softsocial.dev", role: "ADMIN" },
  { name: "Sara", email: "sara@softsocial.dev", role: "MEMBER" },
] as const;

const PROFILES = [
  { platform: "FACEBOOK", name: "Facebook - IT Eksperts", username: "itexperts" },
  { platform: "FACEBOOK", name: "Facebook - CrimeCaseHub", username: "crimecasehub" },
  { platform: "FACEBOOK", name: "Facebook - MoneyMuse", username: "moneymuse" },
  { platform: "FACEBOOK", name: "Facebook - WC Pulse", username: "wcpulse" },
  { platform: "LINKEDIN", name: "LinkedIn - IT Eksperts", username: "it-eksperts" },
  { platform: "LINKEDIN", name: "LinkedIn - Client ABC", username: "client-abc" },
] as const;

const FACEBOOK_COPY =
  "AI chatbots can help businesses answer customers 24/7. "
  + "Want an AI chatbot on your website? Talk to us today.";

const LINKEDIN_COPY =
  "AI chatbots can help businesses answer customers 24/7. "
  + "Want an AI chatbot on your website? Talk to us today.";

/** A 1x1 transparent PNG, used as the post's image. */
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function seed() {
  const passwordHash = await hashPassword(PASSWORD);

  const users = new Map<string, { id: string; name: string }>();

  for (const person of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      create: { name: person.name, email: person.email, passwordHash },
      update: { name: person.name, passwordHash },
      select: { id: true, name: true },
    });

    users.set(person.email, user);
  }

  const owner = users.get("mufaqar@softsocial.dev")!;
  const ahmed = users.get("ahmed@softsocial.dev")!;

  const workspace = await prisma.workspace.upsert({
    where: { slug: slugify("IT Eksperts") },
    create: {
      name: "IT Eksperts",
      slug: slugify("IT Eksperts"),
      timezone: "Asia/Karachi",
      settings: { create: { defaultTimezone: "Asia/Karachi" } },
    },
    update: { name: "IT Eksperts" },
    select: { id: true, name: true },
  });

  for (const person of PEOPLE) {
    const user = users.get(person.email)!;

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
      },
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: person.role,
        status: "ACTIVE",
        joinedAt: new Date(),
        invitedById: owner.id,
      },
      update: { role: person.role, status: "ACTIVE" },
    });
  }

  const profiles = new Map<string, { id: string }>();

  for (const profile of PROFILES) {
    const row = await prisma.socialProfile.upsert({
      where: {
        workspaceId_platform_name: {
          workspaceId: workspace.id,
          platform: profile.platform,
          name: profile.name,
        },
      },
      create: {
        workspaceId: workspace.id,
        platform: profile.platform,
        name: profile.name,
        username: profile.username,
        profileUrl: `https://${
          profile.platform === "FACEBOOK" ? "facebook.com" : "linkedin.com"
        }/${profile.username}`,
        description: `${profile.platform === "FACEBOOK" ? "Facebook page" : "LinkedIn page"} tracked manually in Phase 1.`,
        status: "ACTIVE",
        assignedUserId: null,
      },
      update: { status: "ACTIVE" },
      select: { id: true },
    });

    profiles.set(profile.name, row);
  }

  // The post's image lives in the same place the local storage driver reads.
  const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? "./storage");
  const mediaKey = `${workspace.id}/seed-chatbot.png`;
  await mkdir(path.join(storageRoot, workspace.id), { recursive: true });
  await writeFile(path.join(storageRoot, mediaKey), PLACEHOLDER_PNG);

  // Media has no unique key on storageKey, so look it up by hand.
  const existingMedia = await prisma.media.findFirst({
    where: { workspaceId: workspace.id, storageKey: mediaKey },
    select: { id: true },
  });

  const media = existingMedia
    ? await prisma.media.update({
        where: { id: existingMedia.id },
        data: { size: PLACEHOLDER_PNG.byteLength, mimeType: "image/png" },
        select: { id: true },
      })
    : await prisma.media.create({
        data: {
          workspaceId: workspace.id,
          filename: "ai-chatbot.png",
          mimeType: "image/png",
          size: PLACEHOLDER_PNG.byteLength,
          storageKey: mediaKey,
          altText: "Chat window illustration",
          uploadedById: owner.id,
        },
        select: { id: true },
      });

  const post = await prisma.post.upsert({
    where: { id: "seed-ai-chatbot-promotion" },
    create: {
      id: "seed-ai-chatbot-promotion",
      workspaceId: workspace.id,
      title: "AI Chatbot Promotion",
      content: FACEBOOK_COPY,
      hashtags: ["#AIChatbot", "#Automation", "#ITExperts"],
      notes: "Publish manually in this order: Facebook first, then LinkedIn.",
      status: "IN_PROGRESS",
      createdByUserId: owner.id,
      updatedByUserId: owner.id,
      assignedUserId: ahmed.id,
    },
    update: {},
    select: { id: true },
  });

  for (const [platform, text] of [
    ["FACEBOOK", FACEBOOK_COPY],
    ["LINKEDIN", LINKEDIN_COPY],
  ] as const) {
    await prisma.postVariant.upsert({
      where: { postId_platform: { postId: post.id, platform } },
      create: { postId: post.id, platform, text },
      update: { text },
    });
  }

  await prisma.postMedia.upsert({
    where: { postId_mediaId: { postId: post.id, mediaId: media.id } },
    create: { postId: post.id, mediaId: media.id, position: 0 },
    update: { position: 0 },
  });

  // The acceptance state: three targets completed by hand, one still pending.
  const targets = [
    { name: "Facebook - IT Eksperts", status: "COMPLETED" },
    { name: "Facebook - MoneyMuse", status: "COMPLETED" },
    { name: "Facebook - WC Pulse", status: "COMPLETED" },
    { name: "LinkedIn - IT Eksperts", status: "PENDING" },
  ] as const;

  for (const target of targets) {
    const profile = profiles.get(target.name)!;

    const completed = target.status === "COMPLETED";

    await prisma.postTarget.upsert({
      where: {
        postId_socialProfileId: { postId: post.id, socialProfileId: profile.id },
      },
      create: {
        postId: post.id,
        workspaceId: workspace.id,
        socialProfileId: profile.id,
        assignedUserId: ahmed.id,
        status: target.status,
        notes: completed ? "Published manually and confirmed with a screenshot." : null,
        completedAt: completed ? new Date(Date.now() - 2 * 60 * 60 * 1000) : null,
        completedByUserId: completed ? ahmed.id : null,
      },
      update: { status: target.status },
    });
  }

  await prisma.postComment.upsert({
    where: { id: "seed-comment-1" },
    create: {
      id: "seed-comment-1",
      workspaceId: workspace.id,
      postId: post.id,
      userId: owner.id,
      content: "Please attach the campaign screenshot once the Facebook posts are live.",
    },
    update: {},
  });

  const activityCount = await prisma.activityLog.count({
    where: { workspaceId: workspace.id },
  });

  if (activityCount === 0) {
    await prisma.activityLog.createMany({
      data: [
        {
          workspaceId: workspace.id,
          userId: owner.id,
          action: "WORKSPACE_CREATED",
          entityType: "WORKSPACE",
          entityId: workspace.id,
          summary: `${owner.name} created the workspace "IT Eksperts"`,
        },
        {
          workspaceId: workspace.id,
          userId: owner.id,
          action: "POST_CREATED",
          entityType: "POST",
          entityId: post.id,
          summary: `${owner.name} created the post "AI Chatbot Promotion"`,
        },
      ],
    });
  }

  console.log("Seed complete.");
  console.log(`  workspace : ${workspace.name}`);
  console.log(`  post      : ${"AI Chatbot Promotion"} (4 targets, 3 completed, 1 pending)`);
  console.log("");
  console.log(`  Sign in with any of these (password: ${PASSWORD})`);
  for (const person of PEOPLE) {
    console.log(`    ${person.role.padEnd(6)} ${person.email}`);
  }
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
