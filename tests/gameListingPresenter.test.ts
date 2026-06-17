import { describe, expect, it } from "vitest";

import {
  getListingVersions,
  parseListingPageVersion,
} from "../src/features/games/presenters.js";

describe("gameListingPresenter", () => {
  it("defaults unknown page versions to JAM", () => {
    expect(parseListingPageVersion("bogus")).toBe("JAM");
  });

  it("prefers POST_JAM for ALL listings when a post-jam page exists", () => {
    expect(
      getListingVersions(
        {
          pages: [
            { version: "JAM" },
            { version: "POST_JAM" },
          ],
        } as never,
        "ALL",
      ),
    ).toEqual(["POST_JAM"]);
  });
});
