import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/auth/dal";
import { getMedia } from "@/lib/data/media";
import { getMediaStorage } from "@/lib/storage";

/**
 * Streams a media object after checking that the caller belongs to the same
 * workspace as the file. Images are rendered through this route instead of
 * `<Image>` so the storage key never has to be public.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/media/[id]">,
) {
  await requireWorkspace();

  const { id } = await params;
  const media = await getMedia(id);

  if (!media) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storage = getMediaStorage();
  const body = await storage.get(media.storageKey);

  if (!body) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${media.filename.replace(/"/g, "")}"`,
    },
  });
}
