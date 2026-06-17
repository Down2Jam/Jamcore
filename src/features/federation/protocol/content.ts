import { resolvePublicUrl } from "./urls.js";

export type FederationEmoji = {
  shortcode: string;
  imageUrl: string;
};

export type FederationContentTag =
  | {
      type: "Hashtag";
      name: string;
      href?: string;
    }
  | {
      type: "Emoji";
      id: string;
      name: string;
      icon: {
        type: "Image";
        mediaType: "image/png";
        url: string;
      };
    };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function extractHashtags(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const matches = [...value.matchAll(/(^|[\s(])#([a-z0-9_]+)/gi)];
  return [...new Set(matches.map((match) => `#${match[2]}`))];
}

export function extractCustomEmojiShortcodes(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const matches = [...value.matchAll(/(^|[^a-z0-9_]):([a-z0-9_+-]+):(?=$|[^a-z0-9_])/gi)];
  return [...new Set(matches.map((match) => match[2].toLowerCase()))];
}

export function buildFederatedContent({
  value,
  emojis = [],
  extraHashtags = [],
}: {
  value: string | null | undefined;
  emojis?: FederationEmoji[];
  extraHashtags?: string[];
}) {
  const normalized = (value ?? "").trim();
  const emojiMap = new Map(
    emojis.map((emoji) => [emoji.shortcode.toLowerCase(), emoji]),
  );

  const content = !normalized
    ? "<p></p>"
    : normalized
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("");

  const hashtags = [...new Set([...extraHashtags, ...extractHashtags(normalized)])].map(
    (name) => ({
      type: "Hashtag" as const,
      name,
    }),
  );

  const emojiTags = extractCustomEmojiShortcodes(normalized)
    .map((shortcode) => emojiMap.get(shortcode))
    .filter((emoji): emoji is FederationEmoji => Boolean(emoji))
    .map((emoji) => ({
      type: "Emoji" as const,
      id: resolvePublicUrl(`/ap/emojis/${emoji.shortcode}`) ?? `/ap/emojis/${emoji.shortcode}`,
      name: `:${emoji.shortcode}:`,
      icon: {
        type: "Image" as const,
        mediaType: "image/png" as const,
        url: emoji.imageUrl,
      },
    }));

  return {
    content,
    tags: [...hashtags, ...emojiTags] satisfies FederationContentTag[],
  };
}
