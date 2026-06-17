export type ResultsViewer = {
  admin?: boolean | null;
} | null | undefined;

export type LoadedJam = {
  id: number;
  slug?: string | null;
  startTime: Date | string;
  jammingHours?: number | null;
  submissionHours?: number | null;
  ratingHours?: number | null;
} | null | undefined;

export function canViewResults({
  jam,
  jamQuery,
  preview,
  recap,
  viewer,
}: {
  jam: LoadedJam;
  jamQuery?: string;
  preview?: string;
  recap?: string;
  viewer?: ResultsViewer;
}) {
  if (
    !jam ||
    !jamQuery ||
    (String(jam.id) !== jamQuery && jam.slug !== jamQuery)
  ) {
    return true;
  }

  const startMs = new Date(jam.startTime).getTime();
  const jammingMs = (jam.jammingHours ?? 0) * 60 * 60 * 1000;
  const submissionMs = (jam.submissionHours ?? 0) * 60 * 60 * 1000;
  const ratingMs = (jam.ratingHours ?? 0) * 60 * 60 * 1000;
  const endTs = startMs + jammingMs + submissionMs + ratingMs;
  const isOver = Date.now() >= endTs;
  const canPreviewResults = preview === "1" && Boolean(viewer?.admin);
  const canViewRecapResults = recap === "1";

  return isOver || canPreviewResults || canViewRecapResults;
}
