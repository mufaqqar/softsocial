"use client";

import { useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { switchWorkspaceAction } from "@/actions/workspace";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceSummary } from "@/lib/auth/dal";

export function WorkspaceNav({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
}) {
  const [pending, startTransition] = useTransition();
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  function select(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) {
      return;
    }

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);

    startTransition(() => {
      void switchWorkspaceAction(formData);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[14rem] min-w-0"
          disabled={pending}
        >
          <span className="truncate">{active?.name ?? "Select workspace"}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onSelect={() => select(workspace.id)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{workspace.name}</span>
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              {workspace.role.toLowerCase()}
              {workspace.id === activeWorkspaceId ? <Check className="size-3.5" /> : null}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/workspaces/new">
            <Plus />
            New workspace
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
