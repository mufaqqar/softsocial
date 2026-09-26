"use client";

import { useRef } from "react";
import Link from "next/link";
import { LogOut, Settings, User } from "lucide-react";

import { logoutAction } from "@/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import type { WorkspaceRole } from "@/generated/prisma/enums";

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: WorkspaceRole;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">Account menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate">{name}</span>
          <span className="text-muted-foreground block truncate text-xs font-normal">{email}</span>
          <span className="text-muted-foreground mt-1 block text-xs font-normal capitalize">
            {role.toLowerCase()} in this workspace
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <User />
            Profile & password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <Settings />
            Workspace settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={(event) => {
            // Sign out is a POST Server Action, so it needs a form submit.
            event.preventDefault();
            formRef.current?.requestSubmit();
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
        <form action={logoutAction} ref={formRef} className="hidden" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
