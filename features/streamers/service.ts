import axios from "axios";

import db from "../../infra/db.js";
import { appConfig } from "../../config/app.js";
import logger from "../../infra/logger.js";

type TwitchStream = {
  user_name: string;
  thumbnail_url: string;
  title: string;
  viewer_count: number;
  language: string;
  game_id: string;
  tags?: string[];
  is_mature?: boolean;
};

type TwitchTokenResponse = {
  access_token: string;
};

type TwitchStreamsResponse = {
  data: TwitchStream[];
  pagination?: {
    cursor?: string;
  };
};

const MIN_FEATURED_STREAMERS = 3;
const blockedStreamerNames = new Set(["morninchai", "lana_lux"]);

export async function listFeaturedStreamers() {
  return db.featuredStreamer.findMany();
}

function isMatureStream(stream: Pick<TwitchStream, "title" | "tags" | "is_mature">) {
  if (stream.is_mature) return true;

  const title = stream.title.toLowerCase();
  if (/(^|[\s[\]()[\]{}|:;,.!?#/+_-])(?:18\+|18plus|adult|nsfw)(?=$|[\s[\]()[\]{}|:;,.!?#/+_-])/i.test(title)) {
    return true;
  }

  return (stream.tags ?? []).some((tag) => {
    const normalized = tag.toLowerCase().replace(/[\s_-]+/g, "");
    return [
      "18+",
      "18plus",
      "adult",
      "mature",
      "matureaudience",
      "nsfw",
      "sexualthemes",
    ].includes(normalized);
  });
}

function isBlockedStreamer(stream: Pick<TwitchStream, "user_name">) {
  return blockedStreamerNames.has(stream.user_name.toLowerCase());
}

export async function updateFeaturedStreamers() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  try {
    if (!clientId || !clientSecret) {
      logger.warn(
        "Skipping featured streamers update because Twitch credentials are missing.",
      );
      return;
    }

    const tokenResponse = await axios.post<TwitchTokenResponse>(
      "https://id.twitch.tv/oauth2/token",
      null,
      {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        },
      },
    );
    const accessToken = tokenResponse.data.access_token;

    const gameIds = appConfig.featuredStreamers.gameIds;

    let allStreams: TwitchStream[] = [];
    let cursor: string | null = null;

    do {
      const response: { data: TwitchStreamsResponse } = await axios.get<TwitchStreamsResponse>(
        "https://api.twitch.tv/helix/streams",
        {
          headers: {
            "Client-ID": clientId,
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            first: 100,
            game_id: gameIds,
            type: "live",
            after: cursor,
          },
        },
      );

      allStreams = allStreams.concat(response.data.data);
      cursor = response.data.pagination?.cursor || null;
    } while (cursor);

    const streams = (allStreams || []).filter(
      (stream) => !isMatureStream(stream) && !isBlockedStreamer(stream),
    );

    const tagSynonyms = appConfig.featuredStreamers.tagSynonyms;
    const priorityTags = appConfig.featuredStreamers.priorityTags;
    const desiredTags = appConfig.featuredStreamers.desiredTags;
    const streamers = await db.user.findMany({
      where: {
        twitch: {
          not: null,
        },
      },
    });
    const streamerNames = streamers.map((streamer) =>
      streamer.twitch?.toLowerCase(),
    );

    const normalizedStreams = streams.map((stream) => {
      if (!stream.tags) {
        stream.tags = [];
      }

      if (stream.game_id === "509660") {
        stream.tags.push("art");
      } else if (stream.game_id === "66082") {
        stream.tags.push("games");
      } else if (stream.game_id === "1599346425") {
        stream.tags.push("coworking");
      }

      if (stream.tags) {
        const seen = new Set<string>();
        stream.tags = stream.tags
          .map((tag) => tagSynonyms[tag.toLowerCase()] || tag.toLowerCase())
          .filter((tag) => (seen.has(tag) ? false : seen.add(tag)));
      }
      return stream;
    });

    const hasDesiredTag = (stream: TwitchStream) =>
      (stream.tags ?? []).some((t) =>
        desiredTags.includes(t.toLowerCase()),
      );

    const hasPriorityTag = (stream: TwitchStream) =>
      (stream.tags ?? []).some((t) =>
        priorityTags.includes(t.toLowerCase()),
      );

    const isKnownStreamer = (stream: TwitchStream) =>
      streamerNames.includes(stream.user_name.toLowerCase());

    const priorityStreams = normalizedStreams
      .filter(hasPriorityTag)
      .sort(
        (a, b) =>
          Math.log10(b.viewer_count + 1) -
          Math.log10(a.viewer_count + 1) +
          (Math.random() - 0.5) * 2,
      );

    const streamerStreams = normalizedStreams
      .filter(hasDesiredTag)
      .filter((s) => !hasPriorityTag(s))
      .filter(isKnownStreamer)
      .sort(
        (a, b) =>
          Math.log10(b.viewer_count + 1) -
          Math.log10(a.viewer_count + 1) +
          (Math.random() - 0.5) * 2,
      );

    await db.featuredStreamer.deleteMany();

    const finalStreams: TwitchStream[] = [];
    const addedStreamers = new Set<string>();

    const addUniqueStreams = (candidates: TwitchStream[], limit?: number) => {
      for (const stream of candidates) {
        if (limit != null && finalStreams.length >= limit) return;

        const lowerCaseName = stream.user_name.toLowerCase();
        if (!addedStreamers.has(lowerCaseName)) {
          addedStreamers.add(lowerCaseName);
          finalStreams.push(stream);
        }
      }
    };

    const fallbackStreams = normalizedStreams
      .filter(hasDesiredTag)
      .filter((s) => s.language === "en")
      .filter((s) => !hasPriorityTag(s))
      .filter((s) => !isKnownStreamer(s))
      .sort(
        (a, b) =>
          Math.log10(b.viewer_count + 1) -
          Math.log10(a.viewer_count + 1) +
          (Math.random() - 0.5) * 2,
      );

    addUniqueStreams(priorityStreams);
    addUniqueStreams(streamerStreams);
    addUniqueStreams(fallbackStreams, MIN_FEATURED_STREAMERS);

    for (const stream of finalStreams) {
      await db.featuredStreamer.create({
        data: {
          userName: stream.user_name,
          thumbnailUrl: stream.thumbnail_url
            .replace("{width}", "480")
            .replace("{height}", "270"),
          streamTitle: stream.title,
          streamTags: stream.tags,
          viewerCount: stream.viewer_count,
        },
      });
    }
  } catch (error) {
    logger.error(
      "Error updating featured streamers: %s",
      error instanceof Error ? error.message : String(error),
    );
  }
}

