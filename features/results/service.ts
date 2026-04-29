import { z } from "zod";

import { loadGameResults } from "./game-results.js";
import { loadMusicResults } from "./music-results.js";
import { resultsQuerySchema, type ResultsQuery } from "./schemas.js";
import {
  canViewResults,
  type LoadedJam,
  type ResultsViewer,
} from "./visibility.js";

export { resultsQuerySchema } from "./schemas.js";
export type { LoadedJam, ResultsViewer } from "./visibility.js";

export async function getResults({
  input,
  jam,
  viewer,
}: {
  input: ResultsQuery;
  jam?: LoadedJam;
  viewer?: ResultsViewer;
}) {
  if (
    !canViewResults({
      jam,
      jamQuery: input.jam,
      preview: input.preview,
      recap: input.recap,
      viewer,
    })
  ) {
    return { data: [] };
  }

  const resolvedJamId: number | undefined =
    input.jam && input.jam !== "all"
      ? jam?.id ??
        (Number.isNaN(Number.parseInt(String(input.jam), 10))
          ? undefined
          : Number.parseInt(String(input.jam), 10))
      : undefined;

  if (input.contentType === "MUSIC") {
    if (input.jam === "all") {
      return { data: [] };
    }

    if (!resolvedJamId) {
      return { data: [] };
    }

    return {
      data: await loadMusicResults({
        jamId: resolvedJamId,
        category: input.category,
      }),
    };
  }

  return {
    data: await loadGameResults({
      jamId: resolvedJamId,
      category: input.category,
      contentType: input.contentType,
      sort: input.sort,
    }),
  };
}

export type { ResultsQuery };
