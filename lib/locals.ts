import type { Response } from "express";

import type {
  RequestUserLocals,
  TargetTeamContext,
  TargetUserContext,
} from "../types/locals.js";

export type LoadedJam = {
  id: number;
  startTime: Date | string;
  jammingHours?: number | null;
  submissionHours?: number | null;
  ratingHours?: number | null;
};

export type LoadedLeaderboard = {
  id: number;
  type: string;
  decimalPlaces: number;
};

function invariant<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }

  return value;
}

export function requireRequestUser(res: Response) {
  return invariant<RequestUserLocals>(
    res.locals.user,
    "Request user was not loaded",
  );
}

export function requireUserSlug(res: Response) {
  const userSlug = invariant(res.locals.userSlug, "User slug was not loaded");

  if (typeof userSlug !== "string") {
    throw new Error("User slug locals are incomplete");
  }

  return userSlug;
}

export function requireTargetUser(res: Response) {
  return invariant<TargetUserContext>(
    res.locals.targetUser,
    "Target user was not loaded",
  );
}

export function requireTargetTeam(res: Response) {
  return invariant<TargetTeamContext>(
    res.locals.targetTeam,
    "Target team was not loaded",
  );
}

export function requireLoadedJam<
  T extends Record<string, unknown> = Record<string, unknown>,
>(res: Response) {
  const jam = invariant(res.locals.jam, "Jam was not loaded");

  if (typeof jam.id !== "number" || jam.startTime == null) {
    throw new Error("Jam locals are incomplete");
  }

  return jam as T & LoadedJam;
}

export function requireLoadedLeaderboard<
  T extends Record<string, unknown> = Record<string, unknown>,
>(res: Response) {
  const leaderboard = invariant(res.locals.leaderboard, "Leaderboard was not loaded");

  if (
    typeof leaderboard.id !== "number" ||
    typeof leaderboard.type !== "string" ||
    typeof leaderboard.decimalPlaces !== "number"
  ) {
    throw new Error("Leaderboard locals are incomplete");
  }

  return leaderboard as T & LoadedLeaderboard;
}
