import db from "../../infra/db.js";
import { NotFoundError } from "../../lib/errors.js";
import { assertTeamAllowsCollaboration } from "./policies.js";
import type { TargetTeamContext } from "./targetTeam.service.js";

type TeamCollaborationActor = {
  id: number;
};

type TargetUserRef = {
  id: number;
};

export async function createTeamApplication({
  actor,
  team,
  content,
}: {
  actor: TeamCollaborationActor;
  team: TargetTeamContext;
  content?: string;
}) {
  assertTeamAllowsCollaboration(team, "That team is a part of O.D.A");

  const application = await db.teamApplication.create({
    data: {
      userId: actor.id,
      teamId: team.id,
      content: content ? content : null,
    },
  });

  await db.notification.create({
    data: {
      teamApplicationId: application.id,
      recipientId: team.ownerId,
      actorId: actor.id,
      type: "TEAM_APPLICATION",
    },
  });

  return application;
}

export async function createTeamInvite({
  actor,
  team,
  targetUser,
  content,
}: {
  actor: TeamCollaborationActor;
  team: TargetTeamContext;
  targetUser: TargetUserRef;
  content?: string;
}) {
  assertTeamAllowsCollaboration(team, "Your team is a part of O.D.A");

  const invite = await db.teamInvite.create({
    data: {
      userId: targetUser.id,
      teamId: team.id,
      content: content ? content : null,
    },
    include: {
      user: true,
    },
  });

  await db.notification.create({
    data: {
      teamInviteId: invite.id,
      recipientId: targetUser.id,
      actorId: actor.id,
      type: "TEAM_INVITE",
    },
  });

  return invite;
}

export async function deleteTeamById(teamId: number) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      game: {
        select: {
          id: true,
          pages: {
            select: {
              id: true,
              tracks: {
                select: {
                  id: true,
                },
              },
              leaderboards: {
                select: {
                  id: true,
                },
              },
              achievements: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
      invites: {
        select: {
          id: true,
        },
      },
      applications: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!team) {
    throw new NotFoundError("Team missing.");
  }

  await db.$transaction(async (tx) => {
    const gameId = team.game?.id;
    const pageIds = team.game?.pages.map((page) => page.id) ?? [];
    const trackIds = team.game?.pages.flatMap((page) => page.tracks.map((track) => track.id)) ?? [];
    const leaderboardIds =
      team.game?.pages.flatMap((page) =>
        page.leaderboards.map((leaderboard) => leaderboard.id),
      ) ?? [];
    const achievementIds =
      team.game?.pages.flatMap((page) =>
        page.achievements.map((achievement) => achievement.id),
      ) ?? [];

    if (trackIds.length > 0) {
      await tx.notification.deleteMany({
        where: {
          trackId: { in: trackIds },
        },
      });
      await tx.comment.deleteMany({
        where: {
          trackId: { in: trackIds },
        },
      });
      await tx.trackRating.deleteMany({
        where: {
          trackId: { in: trackIds },
        },
      });
      await tx.trackTimestampComment.deleteMany({
        where: {
          trackId: { in: trackIds },
        },
      });
      await tx.gamePageTrack.deleteMany({
        where: {
          id: { in: trackIds },
        },
      });
    }

    if (leaderboardIds.length > 0) {
      await tx.score.deleteMany({
        where: {
          leaderboardId: { in: leaderboardIds },
        },
      });
      await tx.gamePageLeaderboard.deleteMany({
        where: {
          id: { in: leaderboardIds },
        },
      });
    }

    if (achievementIds.length > 0) {
      await tx.gamePageAchievement.deleteMany({
        where: {
          id: { in: achievementIds },
        },
      });
    }

    if (pageIds.length > 0) {
      await tx.comment.deleteMany({
        where: {
          gamePageId: { in: pageIds },
        },
      });
      await tx.rating.deleteMany({
        where: {
          gamePageId: { in: pageIds },
        },
      });
      await tx.ghost.deleteMany({
        where: {
          gamePageId: { in: pageIds },
        },
      });
      await tx.data.deleteMany({
        where: {
          gamePageId: { in: pageIds },
        },
      });
      await tx.gamePageDownloadLink.deleteMany({
        where: {
          gamePageId: { in: pageIds },
        },
      });
      await tx.gamePage.deleteMany({
        where: {
          id: { in: pageIds },
        },
      });
    }

    if (gameId) {
      await tx.notification.deleteMany({
        where: {
          gameId,
        },
      });
      await tx.comment.deleteMany({
        where: {
          gameId,
        },
      });
      await tx.rating.deleteMany({
        where: {
          gameId,
        },
      });
      await tx.gameDownloadLink.deleteMany({
        where: {
          gameId,
        },
      });
      await tx.game.delete({
        where: {
          id: gameId,
        },
      });
    }

    if (team.applications.length > 0) {
      const applicationIds = team.applications.map((application) => application.id);
      await tx.notification.deleteMany({
        where: {
          teamApplicationId: { in: applicationIds },
        },
      });
      await tx.teamApplication.deleteMany({
        where: {
          id: { in: applicationIds },
        },
      });
    }

    if (team.invites.length > 0) {
      const inviteIds = team.invites.map((invite) => invite.id);
      await tx.notification.deleteMany({
        where: {
          teamInviteId: { in: inviteIds },
        },
      });
      await tx.teamInvite.deleteMany({
        where: {
          id: { in: inviteIds },
        },
      });
    }

    await tx.notification.deleteMany({
      where: {
        teamId,
      },
    });

    await tx.team.delete({
      where: {
        id: teamId,
      },
    });
  });
}
