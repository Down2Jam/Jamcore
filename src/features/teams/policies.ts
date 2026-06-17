import db from "../../infra/db.js";
import { BadRequestError, ForbiddenError } from "../../lib/errors.js";
import { ODA_GAME_CATEGORY } from "../../domain/gamePolicies.js";
import type { TargetTeamContext } from "./targetTeam.service.js";

export function assertTeamAllowsCollaboration(
  team: TargetTeamContext | { game?: { category?: string | null } | null },
  message: string,
) {
  if (team.game && team.game.category === ODA_GAME_CATEGORY) {
    throw new ForbiddenError(message);
  }
}

export function assertTargetTeamApplicationsOpen(
  team: TargetTeamContext | null | undefined,
) {
  if (!team) {
    throw new BadRequestError("Target team not loaded.");
  }

  if (!team.applicationsOpen) {
    throw new ForbiddenError("Team applications are not open.");
  }
}

export async function assertUserHasNotAppliedForTargetTeam({
  userId,
  teamId,
}: {
  userId: number;
  teamId: number;
}) {
  const application = await db.teamApplication.findFirst({
    where: {
      userId,
      teamId,
    },
  });

  if (application) {
    throw new ForbiddenError("User has already applied for team.");
  }
}

export async function assertTargetTeamHasNotInvitedUser({
  targetUserId,
  teamId,
}: {
  targetUserId: number;
  teamId: number;
}) {
  const invite = await db.teamInvite.findFirst({
    where: {
      userId: targetUserId,
      teamId,
    },
  });

  if (invite) {
    throw new ForbiddenError("User has already been invited to the team.");
  }
}
