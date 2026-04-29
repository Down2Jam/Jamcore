import type { Prisma } from "@prisma/client";
import { PageVersion } from "@prisma/client";

import db from "../../infra/db.js";
import { BadRequestError } from "../../lib/errors.js";
import type { GamePageWriteBody } from "../../types/game.js";
import { buildTrackWriteData } from "../tracks/write.js";
import { buildGamePagePayload } from "./page.helpers.js";
import { postJamPageInclude } from "./page.read.js";

type DownloadLinkInput = NonNullable<GamePageWriteBody["downloadLinks"]>[number];
type AchievementInput = NonNullable<GamePageWriteBody["achievements"]>[number];
type LeaderboardInput = NonNullable<GamePageWriteBody["leaderboards"]>[number];
type SongInput = NonNullable<GamePageWriteBody["songs"]>[number];
type TrackWriteData = ReturnType<typeof buildTrackWriteData>;
type TrackWriteDataWithComposer = Omit<TrackWriteData, "composerId"> & {
  composerId: number;
};
type GamePageTrackCreateData = Prisma.GamePageTrackCreateWithoutGamePageInput;

function requireComposerId(song: SongInput): TrackWriteDataWithComposer {
  const trackData = buildTrackWriteData(song);
  if (trackData.composerId == null) {
    throw new BadRequestError("Track composer is required.");
  }

  return {
    ...trackData,
    composerId: trackData.composerId,
  };
}

function buildTrackCreateData(song: SongInput): GamePageTrackCreateData {
  const trackData = requireComposerId(song);

  return {
    name: trackData.name,
    slug: trackData.slug,
    url: trackData.url,
    commentary: trackData.commentary,
    bpm: trackData.bpm,
    musicalKey: trackData.musicalKey,
    softwareUsed: trackData.softwareUsed,
    license: trackData.license,
    allowDownload: trackData.allowDownload,
    allowBackgroundUse: trackData.allowBackgroundUse,
    allowBackgroundUseAttribution: trackData.allowBackgroundUseAttribution,
    composer: {
      connect: {
        id: trackData.composerId,
      },
    },
    tags: {
      connect: trackData.tagIds.map((id) => ({ id })),
    },
    flags: {
      connect: trackData.flagIds.map((id) => ({ id })),
    },
    links: {
      create: trackData.links,
    },
    credits: {
      create: trackData.credits,
    },
  };
}

async function syncGamePageTracks(
  pageId: number,
  songs: GamePageWriteBody["songs"],
) {
  const existingTracks = await db.gamePageTrack.findMany({
    where: { gamePageId: pageId },
    select: {
      id: true,
      slug: true,
      ratings: { select: { id: true } },
      timestampComments: { select: { id: true } },
    },
  });

  const existingTrackBySlug = new Map(
    existingTracks.map((track) => [track.slug, track]),
  );
  const incomingSlugs = new Set<string>();

  for (const song of songs ?? []) {
    const trackData = requireComposerId(song);
    const slug = String(trackData.slug ?? "").trim();
    if (!slug) continue;
    incomingSlugs.add(slug);

    const relationData = {
      tags: {
        set: trackData.tagIds.map((id) => ({ id })),
      },
      flags: {
        set: trackData.flagIds.map((id) => ({ id })),
      },
      links: {
        deleteMany: {},
        create: trackData.links,
      },
      credits: {
        deleteMany: {},
        create: trackData.credits,
      },
    };

    const existingTrack = existingTrackBySlug.get(slug);
    if (existingTrack) {
      await db.gamePageTrack.update({
        where: { id: existingTrack.id },
        data: {
          name: trackData.name,
          slug: trackData.slug,
          url: trackData.url,
          commentary: trackData.commentary,
          bpm: trackData.bpm,
          musicalKey: trackData.musicalKey,
          softwareUsed: trackData.softwareUsed,
          license: trackData.license,
          allowDownload: trackData.allowDownload,
          allowBackgroundUse: trackData.allowBackgroundUse,
          allowBackgroundUseAttribution:
            trackData.allowBackgroundUseAttribution,
          composerId: trackData.composerId ?? undefined,
          ...relationData,
        },
      });
      continue;
    }

    await db.gamePageTrack.create({
      data: {
        gamePageId: pageId,
        name: trackData.name,
        slug: trackData.slug,
        url: trackData.url,
        commentary: trackData.commentary,
        bpm: trackData.bpm,
        musicalKey: trackData.musicalKey,
        softwareUsed: trackData.softwareUsed,
        license: trackData.license,
        allowDownload: trackData.allowDownload,
        allowBackgroundUse: trackData.allowBackgroundUse,
        allowBackgroundUseAttribution:
          trackData.allowBackgroundUseAttribution,
        composerId: trackData.composerId ?? undefined,
        tags: {
          connect: trackData.tagIds.map((id) => ({ id })),
        },
        flags: {
          connect: trackData.flagIds.map((id) => ({ id })),
        },
        links: {
          create: trackData.links,
        },
        credits: {
          create: trackData.credits,
        },
      },
    });
  }

  for (const existingTrack of existingTracks) {
    if (incomingSlugs.has(existingTrack.slug)) continue;
    if (
      existingTrack.ratings.length > 0 ||
      existingTrack.timestampComments.length > 0
    ) {
      continue;
    }

    await db.gamePageTrack.delete({
      where: { id: existingTrack.id },
    });
  }
}

async function syncGamePageLeaderboards(
  pageId: number,
  leaderboards: LeaderboardInput[] | undefined,
) {
  const existingLeaderboards = await db.gamePageLeaderboard.findMany({
    where: { gamePageId: pageId },
    include: {
      scores: {
        select: {
          id: true,
        },
      },
    },
  });

  for (const leaderboard of leaderboards ?? []) {
    const existingLeaderboard = existingLeaderboards.find(
      (entry) => entry.id === leaderboard.id,
    );

    if (existingLeaderboard) {
      await db.gamePageLeaderboard.update({
        where: { id: existingLeaderboard.id },
        data: {
          type: leaderboard.type,
          name: leaderboard.name,
          onlyBest: leaderboard.onlyBest,
          maxUsersShown: leaderboard.maxUsersShown ?? undefined,
          decimalPlaces: leaderboard.decimalPlaces ?? undefined,
        },
      });
      continue;
    }

    await db.gamePageLeaderboard.create({
      data: {
        gamePageId: pageId,
        type: leaderboard.type,
        name: leaderboard.name,
        onlyBest: leaderboard.onlyBest,
        maxUsersShown: leaderboard.maxUsersShown ?? undefined,
        decimalPlaces: leaderboard.decimalPlaces ?? undefined,
      },
    });
  }

  for (const existingLeaderboard of existingLeaderboards) {
    if (
      (leaderboards ?? []).some(
        (leaderboard) => leaderboard.id === existingLeaderboard.id,
      )
    ) {
      continue;
    }

    for (const score of existingLeaderboard.scores ?? []) {
      await db.score.delete({
        where: { id: score.id },
      });
    }

    await db.gamePageLeaderboard.delete({
      where: { id: existingLeaderboard.id },
    });
  }
}

export async function upsertGamePage(
  gameId: number,
  version: PageVersion,
  body: GamePageWriteBody,
) {
  const existingPage = await db.gamePage.findFirst({
    where: {
      gameId,
      version,
    },
    select: { id: true },
  });

  const pagePayload = buildGamePagePayload(body);
  const relationData = {
    ratingCategories: (body.ratingCategories ?? []).map((id: number) => ({
      id,
    })),
    majRatingCategories: (body.majRatingCategories ?? []).map((id: number) => ({
      id,
    })),
    flags: (body.flags ?? []).map((id: number) => ({ id })),
    tags: (body.tags ?? []).map((id: number) => ({ id })),
  };

  const sharedData = {
    ...pagePayload,
  };

  if (existingPage) {
    const updateData: Prisma.GamePageUpdateInput = {
      ...sharedData,
      ratingCategories: {
        set: [],
        connect: relationData.ratingCategories,
      },
      majRatingCategories: {
        set: [],
        connect: relationData.majRatingCategories,
      },
      flags: {
        set: [],
        connect: relationData.flags,
      },
      tags: {
        set: [],
        connect: relationData.tags,
      },
      downloadLinks: {
        deleteMany: {},
        create: (body.downloadLinks ?? []).map((link: DownloadLinkInput) => ({
          url: link.url,
          platform: link.platform,
        })),
      },
      achievements: {
        deleteMany: {},
        create: (body.achievements ?? []).map((achievement: AchievementInput) => ({
          name: achievement.name,
          description: achievement.description || "",
          image: achievement.image || "",
        })),
      },
    };

    await db.gamePage.update({
      where: { id: existingPage.id },
      data: updateData,
      include: postJamPageInclude,
    });

    await syncGamePageLeaderboards(existingPage.id, body.leaderboards);
    await syncGamePageTracks(existingPage.id, body.songs ?? []);
    return db.gamePage.findUnique({
      where: { id: existingPage.id },
      include: postJamPageInclude,
    });
  }

  const createData: Prisma.GamePageCreateInput = {
    ...sharedData,
    version,
    game: {
      connect: { id: gameId },
    },
    ratingCategories: {
      connect: relationData.ratingCategories,
    },
    majRatingCategories: {
      connect: relationData.majRatingCategories,
    },
    flags: {
      connect: relationData.flags,
    },
    tags: {
      connect: relationData.tags,
    },
    downloadLinks: {
      create: (body.downloadLinks ?? []).map((link: DownloadLinkInput) => ({
        url: link.url,
        platform: link.platform,
      })),
    },
    achievements: {
      create: (body.achievements ?? []).map((achievement: AchievementInput) => ({
        name: achievement.name,
        description: achievement.description || "",
        image: achievement.image || "",
      })),
    },
    tracks: {
      create: (body.songs ?? []).map((song: SongInput) =>
        buildTrackCreateData(song),
      ),
    },
  };

  const createdPage = await db.gamePage.create({
    data: createData,
    include: postJamPageInclude,
  });

  await syncGamePageLeaderboards(createdPage.id, body.leaderboards);

  return db.gamePage.findUnique({
    where: { id: createdPage.id },
    include: postJamPageInclude,
  });
}
