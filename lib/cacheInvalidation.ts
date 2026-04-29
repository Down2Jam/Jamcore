import { clearGameDetailCache } from "../features/games/detail.service.js";
import { clearGameListingCache } from "../features/games/listing.service.js";
import { clearJamServiceCaches } from "../features/jams/service.js";
import { clearSearchCache } from "../features/search/service.js";

export function invalidatePublicReadCaches(scope: "all" | "content" | "jam" = "all") {
  if (scope === "all" || scope === "content") {
    clearGameDetailCache();
    clearGameListingCache();
    clearSearchCache();
  }

  if (scope === "all" || scope === "jam") {
    clearJamServiceCaches();
  }
}
