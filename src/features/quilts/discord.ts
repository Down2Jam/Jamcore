import sharp from "sharp";

import { appConfig } from "../../config/app.js";
import { env } from "../../config/env.js";
import logger from "../../infra/logger.js";

type QuiltProposalNotification = {
  authorName: string;
  canvas: Array<string | null>;
  height: number;
  quiltName: string;
  quiltSlug: string;
  width: number;
};

function parseHexColor(value: string | null) {
  const hex = value?.replace("#", "") ?? "ffffff";
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

async function renderQuiltProposalImage({
  canvas,
  height,
  width,
}: Pick<QuiltProposalNotification, "canvas" | "height" | "width">) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const color = parseHexColor(canvas[index] ?? null);
    const offset = index * 4;
    pixels[offset] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
    pixels[offset + 3] = 255;
  }

  const scale = Math.max(1, Math.floor(1024 / Math.max(width, height)));
  return sharp(pixels, {
    raw: {
      channels: 4,
      height,
      width,
    },
  })
    .resize(width * scale, height * scale, { kernel: "nearest" })
    .png()
    .toBuffer();
}

export function notifyDiscordQuiltProposal(
  notification: QuiltProposalNotification,
) {
  if (!env.discordQuiltWebhookUrl) {
    return;
  }

  void (async () => {
    try {
      const image = await renderQuiltProposalImage(notification);
      const form = new FormData();
      form.append(
        "payload_json",
        JSON.stringify({
          allowed_mentions: { parse: [] },
          content: `New proposal by ${notification.authorName} for ${notification.quiltName}`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "Open quilt",
                  url: `${appConfig.publicOrigin}/quilts/${notification.quiltSlug}`,
                },
              ],
            },
          ],
          embeds: [
            {
              title: notification.quiltName,
              image: { url: "attachment://quilt-proposal.png" },
            },
          ],
        }),
      );
      const imageBytes = new Uint8Array(image.length);
      imageBytes.set(image);
      form.append(
        "files[0]",
        new Blob([imageBytes], { type: "image/png" }),
        "quilt-proposal.png",
      );

      const response = await fetch(env.discordQuiltWebhookUrl!, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        throw new Error(
          `Discord quilt webhook failed with ${response.status}: ${await response.text()}`,
        );
      }
    } catch (error) {
      logger.warn("Discord quilt webhook failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}
