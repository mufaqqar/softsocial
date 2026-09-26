import type { Metadata } from "next";
import { Trash2, Users } from "lucide-react";

import { removeMemberAction } from "@/actions/team";
import { EmptyState, PageHeader } from "@/components/page-header";
import { MemberStatusBadge, RoleBadge } from "@/components/status-badges";
import { AddMemberDialog, EditMemberDialog } from "@/components/team/member-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireWorkspace } from "@/lib/auth/dal";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { listMembers } from "@/lib/data/team";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const context = await requireWorkspace();
  const members = await listMembers();
  const canManage = can(context.permissions, PERMISSIONS.teamManage);

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone with access to this workspace and the work assigned to them."
        icon={Users}
        actions={canManage ? <AddMemberDialog /> : null}
      />

      {members.length === 0 ? (
        <EmptyState icon={Users} title="No members yet" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="text-right">Open tasks</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.userId === context.user.id;
                  const isOwner = member.role === "OWNER";

                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <p className="font-medium">
                          {member.name}
                          {isSelf ? (
                            <span className="text-muted-foreground text-xs"> (you)</span>
                          ) : null}
                        </p>
                        <p className="text-muted-foreground text-xs">{member.email}</p>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={member.role} />
                      </TableCell>
                      <TableCell>
                        <MemberStatusBadge status={member.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {member.assignedTargetCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {member.lastLoginAt ? formatDate(member.lastLoginAt) : "Never"}
                      </TableCell>

                      {canManage ? (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <EditMemberDialog
                              member={{
                                memberId: member.id,
                                name: member.name,
                                email: member.email,
                                role: member.role,
                                status: member.status,
                                isSelf,
                              }}
                            />
                            {!isOwner && !isSelf ? (
                              <form action={removeMemberAction}>
                                <input type="hidden" name="memberId" value={member.id} />
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                >
                                  <Trash2 />
                                  Remove
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-muted-foreground text-xs">
        Removing a member keeps their posts and notes. Their tasks become unassigned so you can
        reassign them.
      </p>
    </>
  );
}
