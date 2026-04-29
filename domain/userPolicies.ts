type UserLike = {
  id?: number | null;
  mod?: boolean | null;
  admin?: boolean | null;
  twitch?: string | null;
};

type TeamLike = {
  ownerId?: number | null;
  users?: Array<{ id?: number | null }>;
};

type ScoreLike = {
  userId?: number | null;
};

export function isModerator(user: UserLike | null | undefined) {
  return Boolean(user?.mod);
}

export function isAdmin(user: UserLike | null | undefined) {
  return Boolean(user?.admin);
}

export function isStreamer(user: UserLike | null | undefined) {
  return Boolean(user?.twitch);
}

export function isSelf(
  user: UserLike | null | undefined,
  target: UserLike | null | undefined,
) {
  return Boolean(user?.id && target?.id && user.id === target.id);
}

export function ownsTeam(
  user: UserLike | null | undefined,
  team: TeamLike | null | undefined,
) {
  return Boolean(user?.id && team?.ownerId && team.ownerId === user.id);
}

export function isTeamMember(
  user: UserLike | null | undefined,
  team: TeamLike | null | undefined,
) {
  return Boolean(
    user?.id &&
      team?.users?.some((teamUser) => teamUser.id === user.id),
  );
}

export function ownsScore(
  user: UserLike | null | undefined,
  score: ScoreLike | null | undefined,
) {
  return Boolean(user?.id && score?.userId && score.userId === user.id);
}

export function canModerateUserTarget(
  user: UserLike | null | undefined,
  target: UserLike | null | undefined,
) {
  return isModerator(user) || isSelf(user, target);
}

export function canManageTargetTeam(
  user: UserLike | null | undefined,
  team: TeamLike | null | undefined,
) {
  return isModerator(user) || ownsTeam(user, team);
}

export function canUseStreamerTools(user: UserLike | null | undefined) {
  return isModerator(user) || isStreamer(user);
}

export function canManageScoreInTeamContext({
  user,
  team,
  score,
}: {
  user: UserLike | null | undefined;
  team: TeamLike | null | undefined;
  score: ScoreLike | null | undefined;
}) {
  return isModerator(user) || isTeamMember(user, team) || ownsScore(user, score);
}
