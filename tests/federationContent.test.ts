import { describe, expect, it } from "vitest";

import {
  buildFederatedContent,
  extractCustomEmojiShortcodes,
  extractHashtags,
} from "../features/federation/protocol/content.js";

describe("federation content", () => {
  it("extracts hashtags and custom emoji shortcodes", () => {
    expect(extractHashtags("Hello #Jam #gamedev")).toEqual(["#Jam", "#gamedev"]);
    expect(extractCustomEmojiShortcodes("Hi :jamjar: and :spark:")).toEqual([
      "jamjar",
      "spark",
    ]);
  });

  it("renders activitypub-safe HTML and builds tags", () => {
    const rendered = buildFederatedContent({
      value: "Line one\n\nLine two #jam :jamjar:",
      extraHashtags: ["#Edition2026"],
      emojis: [
        {
          shortcode: "jamjar",
          imageUrl: "https://example.com/jamjar.png",
        },
      ],
    });

    expect(rendered.content).toContain("<p>Line one</p>");
    expect(rendered.content).toContain("<p>Line two #jam :jamjar:</p>");
    expect(rendered.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "Hashtag", name: "#jam" }),
        expect.objectContaining({ type: "Hashtag", name: "#Edition2026" }),
        expect.objectContaining({ type: "Emoji", name: ":jamjar:" }),
      ]),
    );
  });
});

