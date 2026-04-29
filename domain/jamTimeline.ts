import { appConfig } from "../config/app.js";

export const JAM_PHASES = appConfig.jam.phases;

export type JamPhase = (typeof JAM_PHASES)[keyof typeof JAM_PHASES];

type TimelineConfig = {
  startTime: Date | string;
  suggestionHours: number;
  slaughterHours: number;
  votingHours: number;
  jammingHours: number;
  submissionHours: number;
  ratingHours: number;
  postJamRefinementHours?: number | null;
  postJamRatingHours?: number | null;
};

export type JamTimeline = {
  startOfSuggestions: Date;
  suggestionEnd: Date;
  slaughterEnd: Date;
  votingEnd: Date;
  jammingEnd: Date;
  submissionEnd: Date;
  ratingEnd: Date;
  postJamRefinementEnd: Date;
  postJamRatingEnd: Date;
};

function addHours(start: Date, hours: number) {
  return new Date(start.getTime() + hours * 60 * 60 * 1000);
}

export function buildJamTimeline(jam: TimelineConfig): JamTimeline {
  const postJamRefinementHours = jam.postJamRefinementHours ?? 14 * 24;
  const postJamRatingHours = jam.postJamRatingHours ?? 14 * 24;
  const start = new Date(jam.startTime);

  const startOfSuggestions = addHours(
    start,
    -(jam.suggestionHours + jam.slaughterHours + jam.votingHours),
  );
  const suggestionEnd = addHours(startOfSuggestions, jam.suggestionHours);
  const slaughterEnd = addHours(suggestionEnd, jam.slaughterHours);
  const votingEnd = addHours(slaughterEnd, jam.votingHours);
  const jammingEnd = addHours(votingEnd, jam.jammingHours);
  const submissionEnd = addHours(jammingEnd, jam.submissionHours);
  const ratingEnd = addHours(submissionEnd, jam.ratingHours);
  const postJamRefinementEnd = addHours(ratingEnd, postJamRefinementHours);
  const postJamRatingEnd = addHours(postJamRefinementEnd, postJamRatingHours);

  return {
    startOfSuggestions,
    suggestionEnd,
    slaughterEnd,
    votingEnd,
    jammingEnd,
    submissionEnd,
    ratingEnd,
    postJamRefinementEnd,
    postJamRatingEnd,
  };
}

export function getJamPhase(jam: TimelineConfig, nowInput: Date | string = new Date()): JamPhase | null {
  const now = new Date(nowInput);
  const timeline = buildJamTimeline(jam);

  if (now >= timeline.startOfSuggestions && now < timeline.suggestionEnd) {
    return JAM_PHASES.suggestion;
  }

  if (now >= timeline.suggestionEnd && now < timeline.slaughterEnd) {
    return JAM_PHASES.elimination;
  }

  if (now >= timeline.slaughterEnd && now < timeline.votingEnd) {
    return JAM_PHASES.voting;
  }

  if (now >= timeline.votingEnd && now < timeline.jammingEnd) {
    return JAM_PHASES.jamming;
  }

  if (now >= timeline.jammingEnd && now < timeline.submissionEnd) {
    return JAM_PHASES.submission;
  }

  if (now >= timeline.submissionEnd && now < timeline.ratingEnd) {
    return JAM_PHASES.rating;
  }

  if (now >= timeline.ratingEnd && now < timeline.postJamRefinementEnd) {
    return JAM_PHASES.postJamRefinement;
  }

  if (now >= timeline.postJamRefinementEnd && now < timeline.postJamRatingEnd) {
    return JAM_PHASES.postJamRating;
  }

  return null;
}
