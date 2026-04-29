import db from "../../infra/db.js";
import { z } from "zod";
import { assignCoreEntityTenant } from "../../infra/coreTenantStore.js";
import { enqueueSearchEntityIndex } from "../search/indexing.service.js";
import { updateTeamSchema } from "./schemas.js";

export async function updateTeamById({
  teamId,
  input,
}: {
  teamId: number;
  input: z.infer<typeof updateTeamSchema>;
}) {
  const updatedTeam = await db.team.update({
    where: {
      id: teamId,
    },
    data: {
      applicationsOpen: input.applicationsOpen,
      description: input.description ? input.description : null,
      name: input.name ? input.name : null,
    },
    select: {
      rolesWanted: { select: { slug: true } },
      users: true,
      invites: true,
    },
  });

  const nextRoleSlugs = [...new Set(input.rolesWanted)];
  const nextUserIds = new Set<number>(input.users.map((user) => user.id));
  const nextInvitationIds = new Set<number>(
    input.invitations.map((invite) => invite.id),
  );

  const rolesWantedToDisconnect = updatedTeam.rolesWanted
    .map((role) => role.slug)
    .filter((slug) => !nextRoleSlugs.includes(slug));
  const usersToDisconnect = updatedTeam.users.filter(
    (user) => !nextUserIds.has(user.id),
  );
  const invitesToDisconnect = updatedTeam.invites.filter(
    (invite) => !nextInvitationIds.has(invite.id),
  );

  await db.team.update({
    where: { id: teamId },
    data: {
      rolesWanted: {
        disconnect: rolesWantedToDisconnect.map((slug) => ({ slug })),
        connect: nextRoleSlugs.map((slug) => ({ slug })),
      },
      users: {
        disconnect: usersToDisconnect.map((user) => ({
          id: user.id,
        })),
      },
    },
  });

  await Promise.all(
    invitesToDisconnect.map((invite) =>
      db.teamInvite.delete({
        where: {
          id: invite.id,
        },
      }),
    ),
  );

  await enqueueSearchEntityIndex({
    entityType: "team",
    entityId: teamId,
  });
}

export async function createTeam({
  ownerId,
  jamId,
  tenantId,
}: {
  ownerId: number;
  jamId: number;
  tenantId?: string;
}) {
  const team = await db.team.create({
    data: {
      ownerId,
      jamId,
      users: {
        connect: { id: ownerId },
      },
    },
  });
  if (tenantId) {
    await assignCoreEntityTenant({
      entityType: "Team",
      entityId: team.id,
      tenantId,
    });
  }

  await enqueueSearchEntityIndex({
    entityType: "team",
    entityId: team.id,
    tenantId,
  });

  return team;
}

export async function leaveTeamById({
  teamId,
  userId,
}: {
  teamId: number;
  userId: number;
}) {
  await db.team.update({
    where: {
      id: teamId,
    },
    data: {
      users: {
        disconnect: { id: userId },
      },
    },
  });

  await enqueueSearchEntityIndex({
    entityType: "team",
    entityId: teamId,
  });
}
