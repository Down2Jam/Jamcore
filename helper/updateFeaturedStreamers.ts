import axios from "axios";
import { PrismaClient } from "@prisma/client";
import db from "./db";

const prisma = new PrismaClient();

export async function updateFeaturedStreamers() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  try {
    // Step 1: Get access token from Twitch API
    const tokenResponse = await axios.post(
      "https://id.twitch.tv/oauth2/token",
      null,
      {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        },
      }
    );
    const accessToken = tokenResponse.data.access_token;

    // Step 2: Fetch streams from Twitch API
    const gameIds = ["1469308723", "509660", "66082", "1599346425"]; // Gamedev, Art, Games&Demos, Coworking

    let allStreams: any[] = [];
    let cursor: string | null = null;

    do {
      const response = await axios.get("https://api.twitch.tv/helix/streams", {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          first: 100,
          game_id: gameIds,
          type: "live",
          after: cursor, // Use the cursor to fetch the next page
        },
      });

      allStreams = allStreams.concat(response.data.data);
      cursor = response.data.pagination?.cursor || null; // Get the next page cursor
    } while (cursor);

    const streams = allStreams || [];

    const tagSynonyms = {
      gamedevelopment: "gamedev",
      ue5: "unrealengine",
      godotengine: "godot",
      unity3d: "unity",
    };

    // Step 3: Filter streams by desired tags
    const priorityTags = ["d2jam"];
    const desiredTags = ["d2jam", "gamejam", "gamedev"];
    const streamers = await db.user.findMany({
      where: {
        twitch: {
          not: null,
        },
      },
    });
    const streamerNames = streamers.map((streamer) =>
      streamer.twitch?.toLowerCase()
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

    const filteredStreams = normalizedStreams.filter((stream) => {
      if (!stream.tags) return false; // Skip streams without tags
      if (stream.language !== "en") return false; // Skip non-English streams
      return stream.tags.some((tag) => desiredTags.includes(tag.toLowerCase()));
    });

    const priorityStreams = filteredStreams
      .filter((stream) =>
        stream.tags.some((tag) => priorityTags.includes(tag.toLowerCase()))
      )
      .sort((a, b) => {
        return (
          Math.log10(b.viewer_count + 1) -
          Math.log10(a.viewer_count + 1) +
          (Math.random() - 0.5) * 2 // Small random offset
        );
      });

    const streamerStreams = filteredStreams
      .filter((stream) =>
        stream.tags.every((tag) => !priorityTags.includes(tag.toLowerCase()))
      )
      .filter((stream) =>
        streamerNames.includes(stream.user_name.toLowerCase())
      )
      .sort((a, b) => {
        return (
          Math.log10(b.viewer_count + 1) -
          Math.log10(a.viewer_count + 1) +
          (Math.random() - 0.5) * 2 // Small random offset
        );
      });

    const numStreams = priorityStreams.length + streamerStreams.length;
    const nonPriorityStreams =
      numStreams < 3
        ? filteredStreams
            .filter((stream) =>
              stream.tags.every(
                (tag) => !priorityTags.includes(tag.toLowerCase())
              )
            )
            .filter(
              (stream) =>
                !streamerNames.includes(stream.user_name.toLowerCase())
            )
            .sort((a, b) => {
              return (
                Math.log10(b.viewer_count + 1) -
                Math.log10(a.viewer_count + 1) +
                (Math.random() - 0.5) * 2 // Small random offset
              );
            })
            .slice(0, 3 - numStreams)
        : [];

    // Step 4: Update database with filtered streams
    await prisma.featuredStreamer.deleteMany(); // Clear existing records

    const finalStreams: any[] = [];
    const addedStreamers = new Set<string>();

    for (const stream of [
      ...priorityStreams,
      ...streamerStreams,
      ...nonPriorityStreams,
    ]) {
      const lowerCaseName = stream.user_name.toLowerCase();
      if (!addedStreamers.has(lowerCaseName)) {
        addedStreamers.add(lowerCaseName);
        finalStreams.push(stream);
      }
    }

    console.log("Inserting new featured streams into database...");
    for (const stream of finalStreams) {
      console.log(stream);
      console.log("Inserting stream:", stream.user_name);
      await prisma.featuredStreamer.create({
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

    console.log("Featured streamers updated successfully!");
  } catch (error) {
    console.error("Error updating featured streamers:", error.message);
  }
}
