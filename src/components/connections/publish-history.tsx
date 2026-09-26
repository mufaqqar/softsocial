"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { retryPublishAction } from "@/actions/publishing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiStatusReport, PublishAttemptRow } from "@/lib/data/connections";
import { formatDateTime } from "@/lib/format";

/**
 * master.txt 3.15. Publishing History and API Status in one screen, because the
 * question a member actually has after a post does not appear is "did it try,
 * and what did the provider say".
 *
 * A failure row explains itself. When the message is not enough, the post detail
 * screen carries a Retry control that re-arms that single target.
 */

function resultVariant(result: string) {
  return result === "SUCCESS" ? ("success" as const) : ("destructive" as const);
}

export function PublishHistory({
  rows,
  canRetry,
}: {
  rows: PublishAttemptRow[];
  canRetry: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function retry(postTargetId: string) {
    setBusy(postTargetId);
    setMessage(null);

    startTransition(async () => {
      const result = await retryPublishAction(postTargetId);
      setMessage(result.message);
      setBusy(null);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border px-4 py-10 text-center text-sm">
        Nothing has been published automatically yet. Attempts appear here as soon as a scheduled
        post is sent to a provider.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {message ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}

      <ul className="divide-y rounded-md border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start gap-3 p-4">
            <Badge variant={resultVariant(row.result)} className="mt-0.5 shrink-0">
              {row.result === "SUCCESS" ? "Published" : "Failed"}
            </Badge>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {row.postTitle || "Untitled post"} → {row.profileName}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Attempt {row.attempt} · {formatDateTime(row.createdAt)}
                {row.errorCode ? ` · ${row.errorCode}` : ""}
              </p>
              {row.errorMessage ? (
                <p className="text-destructive mt-1 text-xs">{row.errorMessage}</p>
              ) : null}
              {row.providerUrl ? (
                <a
                  href={row.providerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary mt-1 inline-block text-xs underline"
                >
                  View the published post
                </a>
              ) : null}
            </div>

            {canRetry && row.result === "FAILURE" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => retry(row.postTargetId)}
                disabled={pending || busy !== null}
              >
                <RotateCcw className="size-3.5" />
                {busy === row.postTargetId ? "Working…" : "Retry"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ApiStatus({ reports }: { reports: ApiStatusReport[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {reports.map((report) => (
        <li key={report.provider} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{report.provider}</span>
            <Badge variant={report.configured ? "success" : "warning"}>
              {report.configured ? "Configured" : "Not configured"}
            </Badge>
            {report.reauthRequiredCount > 0 ? (
              <Badge variant="warning">
                {report.reauthRequiredCount} needs reconnecting
              </Badge>
            ) : null}
          </div>

          <p className="text-muted-foreground mt-2 text-xs">
            {report.connectionCount} connection(s), {report.activeConnectionCount} active
            {report.lastUsedAt ? ` · last used ${formatDateTime(report.lastUsedAt)}` : " · never used"}
          </p>

          {report.missing.length > 0 ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Missing environment variables: {report.missing.join(", ")}
            </p>
          ) : null}

          {report.notes.map((note) => (
            <p key={note} className="text-muted-foreground mt-1 text-xs">
              {note}
            </p>
          ))}

          {report.provider === "META" ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Facebook publishes text and one image per post. Video and multi-image posts stay
              manual.
            </p>
          ) : null}

          {report.provider === "LINKEDIN" ? (
            <p className="text-muted-foreground mt-1 text-xs">
              LinkedIn publishes text and one image per organisation page. Requires Community
              Management API access and an administrator of the page.
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
