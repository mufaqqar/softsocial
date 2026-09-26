"use client";

import { useState, useTransition } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { beginConnectAction, disconnectAction } from "@/actions/connections";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ConnectionRow } from "@/lib/data/connections";
import { formatDateTime } from "@/lib/format";

/**
 * master.txt 3.15. Connecting is a full navigation off-site, so the button asks
 * the server for the provider URL and assigns it to `window.location`. Tokens are
 * never handled here; they are exchanged server-side in the callback route.
 */

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted" | "destructive" | "info"> = {
  ACTIVE: "success",
  INACTIVE: "muted",
  ARCHIVED: "muted",
  REAUTH_REQUIRED: "warning",
  DISCONNECTED: "muted",
  ERROR: "destructive",
};

const STATUS_EXPLANATION: Record<string, string> = {
  REAUTH_REQUIRED:
    "The provider rejected the saved token. Reconnect to resume publishing; queued posts are held until you do.",
  DISCONNECTED: "Disconnected in this workspace. Reconnect to publish again.",
  ERROR: "The last publish attempt through this connection failed unexpectedly.",
};

export function ConnectionsPanel({
  connections,
  canManage,
}: {
  connections: ConnectionRow[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function connect(platform: "FACEBOOK" | "LINKEDIN") {
    setBusy(platform);
    setError(null);

    startTransition(async () => {
      const result = await beginConnectAction(platform);

      if ("error" in result) {
        setError(result.error);
        setBusy(null);

        return;
      }

      window.location.assign(result.url);
    });
  }

  function disconnect(connectionId: string) {
    setBusy(connectionId);
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await disconnectAction(connectionId);

      setNotice(result.message);

      if (!result.ok) {
        setError(result.message);
      }

      setBusy(null);
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => connect("FACEBOOK")} disabled={pending || busy !== null}>
            <ExternalLink className="size-4" />
            {busy === "FACEBOOK" ? "Redirecting…" : "Connect Facebook Pages"}
          </Button>
          <Button
            variant="outline"
            onClick={() => connect("LINKEDIN")}
            disabled={pending || busy !== null}
          >
            <ExternalLink className="size-4" />
            {busy === "LINKEDIN" ? "Redirecting…" : "Connect LinkedIn organisation"}
          </Button>
        </div>
      ) : null}

      {connections.length === 0 ? (
        <p className="text-muted-foreground rounded-md border px-4 py-10 text-center text-sm">
          No accounts connected yet. Until a profile is connected, scheduled posts to it are
          held for you to publish by hand.
        </p>
      ) : (
        <ul className="space-y-3">
          {connections.map((connection) => (
            <li key={connection.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{connection.displayName}</span>
                    <Badge variant="outline">{connection.provider}</Badge>
                    <Badge variant={STATUS_VARIANT[connection.status] ?? "muted"}>
                      {connection.status.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Connected by {connection.connectedByUserName} · {formatDateTime(connection.createdAt)}
                    {connection.linkedProfileCount > 0
                      ? ` · ${connection.linkedProfileCount} profile(s)`
                      : ""}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Token {connection.tokenHint}
                    {connection.tokenExpiresAt
                      ? ` · expires ${formatDateTime(connection.tokenExpiresAt)}`
                      : " · no stated expiry"}
                    {connection.hasRefreshToken ? " · refreshable" : ""}
                  </p>
                  {connection.scopes.length > 0 ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Scopes: {connection.scopes.join(", ")}
                    </p>
                  ) : null}
                </div>

                {canManage && connection.status !== "DISCONNECTED" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnect(connection.id)}
                    disabled={pending || busy !== null}
                  >
                    <RefreshCw className="size-3.5" />
                    {busy === connection.id ? "Working…" : connection.status === "REAUTH_REQUIRED" ? "Reconnect" : "Disconnect"}
                  </Button>
                ) : null}
              </div>

              {STATUS_EXPLANATION[connection.status] ? (
                <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
                  {STATUS_EXPLANATION[connection.status]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
