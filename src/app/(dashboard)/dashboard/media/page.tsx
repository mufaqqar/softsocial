import type { Metadata } from "next";
import { Images, Trash2 } from "lucide-react";

import { deleteMediaAction } from "@/actions/media";
import { MediaUploader } from "@/components/media/media-uploader";
import { EmptyState, PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { listMedia } from "@/lib/data/media";
import { formatBytes, formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Media",
};

export default async function MediaPage() {
  const context = await requireWorkspace();
  const media = await listMedia();
  const canManage = can(context.permissions, PERMISSIONS.mediaManage);

  return (
    <>
      <PageHeader
        title="Media"
        description="Images the team can attach to posts."
        icon={Images}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Upload" className="lg:col-span-1">
          {canManage ? (
            <MediaUploader />
          ) : (
            <p className="text-muted-foreground text-sm">
              Only owners and admins can upload media.
            </p>
          )}
        </SectionCard>

        <div className="lg:col-span-2">
          {media.length === 0 ? (
            <EmptyState
              icon={Images}
              title="No media yet"
              description="Upload an image to attach it to a post."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {media.map((item) => (
                <li key={item.id} className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/${item.id}`}
                    alt={item.altText ?? item.filename}
                    className="aspect-square w-full rounded-md border object-cover"
                  />
                  <div className="space-y-0.5">
                    <p className="truncate text-sm font-medium">{item.filename}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatBytes(item.size)} · {item.mimeType} · {formatDate(item.createdAt)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      by {item.uploadedByName} ·{" "}
                      {item.postCount === 0 ? (
                        "not attached"
                      ) : (
                        <Badge variant="secondary">
                          {item.postCount} post{item.postCount === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </p>
                  </div>

                  {canManage ? (
                    <form action={deleteMediaAction}>
                      <input type="hidden" name="mediaId" value={item.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
