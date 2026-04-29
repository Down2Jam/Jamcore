import db from "../../infra/db.js";
import { NotFoundError } from "../../lib/errors.js";
import { assertTeamAllowsCollaboration } from "./policies.js";

export async function resolveTeamApplication({
  applicationId,
  accept,
}: {
  applicationId: number;
  accept: boolean;
}) {
  const application = await db.teamApplication.findUnique({
    where: {
      id: applicationId,
    },
    include: {
      team: {
        include: {
          game: true,
        },
      },
    },
  });

  if (!application) {
    throw new NotFoundError("Invalid application");
  }

  if (accept) {
    assertTeamAllowsCollaboration(
      application.team as any,
      "Your team is a part of O.D.A",
    );

    await db.team.update({
      where: { id: application.teamId },
      data: {
        users: {
          connect: {
            id: application.userId,
          },
        },
      },
    });
  }

  await db.notification.deleteMany({
    where: {
      teamApplicationId: applicationId,
    },
  });

  await db.teamApplication.delete({
    where: {
      id: applicationId,
    },
  });
}

export async function resolveTeamInvite({
  inviteId,
  accept,
  actorUserId,
}: {
  inviteId: number;
  accept: boolean;
  actorUserId: number;
}) {
  const invite = await db.teamInvite.findUnique({
    where: {
      id: inviteId,
    },
    include: {
      team: {
        include: {
          game: true,
        },
      },
    },
  });

  if (!invite) {
    throw new NotFoundError("Invalid invite");
  }

  if (accept) {
    assertTeamAllowsCollaboration(invite.team as any, "That team is a part of O.D.A");

    await db.team.update({
      where: { id: invite.teamId },
      data: {
        users: {
          connect: {
            id: actorUserId,
          },
        },
      },
    });
  }

  await db.notification.deleteMany({
    where: {
      teamInviteId: inviteId,
    },
  });

  await db.teamInvite.delete({
    where: {
      id: inviteId,
    },
  });
}
