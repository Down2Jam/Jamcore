import { JAM_PHASES, type JamPhase } from "./jamTimeline.js";

export function sortJamsByStartTime<T extends { startTime: Date | string }>(
  jams: T[],
) {
  return [...jams].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

export function getNextJamAfter<T extends { id: number }>(jams: T[], jamId: number) {
  const currentIndex = jams.findIndex((jam) => jam.id === jamId);
  if (currentIndex < 0) {
    return null;
  }

  return jams[currentIndex + 1] ?? null;
}

export function shouldTreatJamAsUpcoming({
  now,
  postJamRatingEnd,
}: {
  now: Date | string;
  postJamRatingEnd: Date;
}) {
  return new Date(now).getTime() < postJamRatingEnd.getTime();
}

export function getFallbackJamPhase(hasUpcomingJam: boolean): JamPhase {
  return hasUpcomingJam ? JAM_PHASES.upcoming : JAM_PHASES.inactive;
}

export function hasJoinedJam({
  userSlug,
  jamUsers,
}: {
  userSlug?: string;
  jamUsers?: Array<{ slug: string }>;
}) {
  if (!userSlug) {
    return false;
  }

  return Boolean(jamUsers?.some((user) => user.slug === userSlug));
}
