"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/activity";
import { formError, type FormState } from "@/lib/form-state";
import { getMediaStorage } from "@/lib/storage";
import { ALLOWED_MEDIA_TYPES, MAX_MEDIA_BYTES } from "@/lib/constants";
import { formatBytes } from "@/lib/format";

/**
 * Accepts the raw File in a FormData field named `file` and stores it under
 * `<workspaceId>/<random>.<ext>`.
 */
export async function uploadMediaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let context: Awaited<ReturnType<typeof assertPermission>>;

  try {
    context = await assertPermission(PERMISSIONS.mediaManage);
  } catch (error) {
    return formError(error);
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: "Choose a file to upload." };
  }

  const extension = ALLOWED_MEDIA_TYPES[file.type];

  if (!extension) {
    return {
      error: `Unsupported file type. Allowed: ${Object.keys(ALLOWED_MEDIA_TYPES)
        .join(", ")}.`,
    };
  }

  if (file.size > MAX_MEDIA_BYTES) {
    return { error: `File is too large. Maximum size is ${formatBytes(MAX_MEDIA_BYTES)}.` };
  }

  const data = Buffer.from(await file.arrayBuffer());
  const key = `${context.workspace.id}/${crypto.randomUUID()}.${extension}`;

  try {
    await getMediaStorage().put(key, data, file.type);

    const altText = String(formData.get("altText") ?? "").trim() || null;

    const media = await prisma.media.create({
      data: {
        workspaceId: context.workspace.id,
        filename: file.name || `upload.${extension}`,
        mimeType: file.type,
        size: data.byteLength,
        storageKey: key,
        altText,
        uploadedById: context.user.id,
      },
      select: { id: true, filename: true },
    });

    await recordActivity({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      action: "MEDIA_UPLOADED",
      entityType: "MEDIA",
      entityId: media.id,
      summary: `${context.user.name} uploaded "${media.filename}"`,
    });

    revalidatePath("/dashboard/media");
    return { ok: true, message: `"${media.filename}" uploaded.`, mediaId: media.id };
  } catch (error) {
    return formError(error);
  }
}

export async function deleteMediaAction(formData: FormData): Promise<void> {
  const context = await assertPermission(PERMISSIONS.mediaManage);
  const mediaId = String(formData.get("mediaId") ?? "");

  const media = await prisma.media.findFirst({
    where: { id: mediaId, workspaceId: context.workspace.id },
    select: { id: true, storageKey: true, filename: true },
  });

  if (!media) {
    return;
  }

  await prisma.media.delete({ where: { id: media.id } });

  try {
    await getMediaStorage().remove(media.storageKey);
  } catch (error) {
    // The row is gone; a leftover object is a storage-cleanup concern only.
    console.error("Failed to remove stored object", error);
  }

  await recordActivity({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    action: "MEDIA_REMOVED",
    entityType: "MEDIA",
    entityId: media.id,
    summary: `${context.user.name} deleted "${media.filename}"`,
  });

  revalidatePath("/dashboard/media");
}
