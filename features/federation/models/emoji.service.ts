import db from "../../../infra/db.js";
import { extractCustomEmojiShortcodes } from "../protocol/content.js";
import { resolvePublicUrl } from "../protocol/urls.js";

export async function loadEmojiDefinitions(
  texts: Array<string | null | undefined>,
) {
  const shortcodes = [...new Set(texts.flatMap((text) => extractCustomEmojiShortcodes(text)))];
  if (shortcodes.length === 0) {
    return [];
  }

  const reactions = await db.reaction.findMany({
    where: {
      slug: {
        in: shortcodes,
      },
    },
    select: {
      slug: true,
      image: true,
    },
  });

  return reactions.map((reaction) => ({
    shortcode: reaction.slug,
    imageUrl: resolvePublicUrl(reaction.image) ?? reaction.image,
  }));
}
