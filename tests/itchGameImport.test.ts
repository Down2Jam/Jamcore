import { describe, expect, it, vi } from "vitest";

vi.mock("../src/infra/db.js", () => ({ default: {} }));
vi.mock("../src/infra/coreTenantStore.js", () => ({
  assignCoreEntityTenant: vi.fn(),
}));
vi.mock("../src/features/teams/index.js", () => ({ createTeam: vi.fn() }));
vi.mock("../src/features/games/creation.service.js", () => ({
  createGame: vi.fn(),
}));

import { parseItchGameHtml } from "../src/features/games/itch-import.service.js";

describe("itch game import metadata", () => {
  it("extracts game, image, embed, and jam metadata", () => {
    const result = parseItchGameHtml(
      `
        <html>
          <head>
            <meta property="og:title" content="Tiny Quest">
            <meta property="og:description" content="A &amp; B go adventuring.">
            <meta property="og:image" content="https://img.itch.zone/a.png">
            <meta content="games/12345" name="itch:path">
          </head>
          <body>
            <h1 class="game_title">Tiny <em>Quest</em></h1>
            <a href="https://itch.io/jam/tiny-jam">Tiny Jam</a>
            <a href="https://itch.io/jam/second-jam/rate/12345">Submission to Second Jam</a>
            <div class="header has_image" id="header">
              <img alt="Tiny Quest" src="https://img.itch.zone/banner.png">
            </div>
            <div class="video_embed">
              <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
            </div>
            <div class="screenshot_list">
              <a data-image_lightbox="true" href="https://img.itch.zone/one.png"><img class="screenshot"></a>
              <a data-image_lightbox="true" href="https://img.itch.zone/two.png"><img class="screenshot"></a>
            </div>
            <span class="version_date">
              <abbr title="03 August 2025 @ 17:51 UTC">Aug 03, 2025</abbr>
            </span>
            <iframe src="https://itch.io/embed/12345"></iframe>
            <div class="view_html_game_page"></div>
            <span title="Download for Windows" class="icon icon-windows8"></span>
            <span title="Download for macOS" class="icon icon-apple"></span>
            <span title="Download for Linux" class="icon icon-tux"></span>
          </body>
        </html>
      `,
      "https://maker.itch.io/tiny-quest",
    );

    expect(result).toEqual({
      url: "https://maker.itch.io/tiny-quest",
      title: "Tiny Quest",
      description: "A & B go adventuring.",
      createdAt: new Date("2025-08-03T17:51:00.000Z"),
      imageUrl: "https://img.itch.zone/a.png",
      bannerUrl: "https://img.itch.zone/banner.png",
      screenshots: [
        "https://img.itch.zone/one.png",
        "https://img.itch.zone/two.png",
      ],
      trailerUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      jamUrl: "https://itch.io/jam/tiny-jam",
      jams: [
        { name: "Tiny Jam", url: "https://itch.io/jam/tiny-jam" },
        { name: "Second Jam", url: "https://itch.io/jam/second-jam" },
      ],
      itchEmbedUrl: "https://itch.io/embed/12345",
      buildPlatforms: ["Web", "Windows", "MacOS", "Linux"],
    });
  });

  it("falls back to the document title and allows a missing jam", () => {
    expect(
      parseItchGameHtml(
        "<html><head><title>Small Game</title></head></html>",
        "https://maker.itch.io/small-game",
      ),
    ).toMatchObject({
      title: "Small Game",
      jamUrl: null,
      jams: [],
      buildPlatforms: ["Other"],
    });
  });

  it("removes itch's creator list from the social title fallback", () => {
    expect(
      parseItchGameHtml(
        '<meta property="og:title" content="Virucide by Ategon, Bioloom Studios, Coeur">',
        "https://ategon.itch.io/virucide",
      ).title,
    ).toBe("Virucide");
  });

  it("maps itch mobile builds to the site's shared mobile platform", () => {
    const result = parseItchGameHtml(
      `
        <h1 class="game_title">Pocket Quest</h1>
        <span title="Download for Android" class="icon icon-android"></span>
        <span title="Download for iOS" class="icon icon-ios"></span>
      `,
      "https://maker.itch.io/pocket-quest",
    );

    expect(result.buildPlatforms).toEqual(["Mobile"]);
  });

  it("does not invent a creation date when itch exposes no build date", () => {
    const result = parseItchGameHtml(
      '<h1 class="game_title">Browser Quest</h1><div class="view_html_game_page"></div>',
      "https://maker.itch.io/browser-quest",
    );

    expect(result.createdAt).toBeNull();
  });
});
