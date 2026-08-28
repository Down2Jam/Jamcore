import { clearGameDetailCache } from "../features/games/detail.service.js";
import { clearJamServiceCaches } from "../features/jams/service.js";
import { clearSearchCache } from "../features/search/service.js";

export function invalidatePublicReadCaches(scope: "all" | "content" | "jam" = "all") {
  if (scope === "all" || scope === "content") {
    clearGameDetailCache();
    clearSearchCache();
    // Ranked game/track listings are shared snapshots refreshed by the
    // platform worker. Do not make a visitor recompute them after each write.
  }

  if (scope === "jam") {
    clearJamServiceCaches();
  }
}
