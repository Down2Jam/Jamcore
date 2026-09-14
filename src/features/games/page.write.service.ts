import type { Prisma } from "@prisma/client";
import { PageVersion } from "@prisma/client";

import db from "../../infra/db.js";
import { BadRequestError } from "../../lib/errors.js";
import { assertChildIds, reconcileMetadata } from "../../lib/reconcileChildren.js";
import type { GamePageWriteBody } from "../../types/game.js";
import { buildTrackWriteData } from "../tracks/write.js";
import { buildGamePagePayload } from "./page.helpers.js";
import { postJamPageInclude } from "./page.read.js";
import {
  attachWebBuildToPage,
  scheduleWebBuildDeletionIfUnreferenced,
  webBuildIdFromUrl,
} from "./web-build.service.js";

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

function buildTrackCreateData(song: SongInput, sortOrder: number): GamePageTrackCreateData {
  const trackData = requireComposerId(song);

  return {
    sortOrder,
    name: trackData.name,
    slug: trackData.slug,
    url: trackData.url,
    commentary: trackData.commentary,
    bpm: trackData.bpm,
    musicalKey: trackData.musicalKey,
    integratedLufs: trackData.integratedLufs,
    truePeakDb: trackData.truePeakDb,
    loudnessGainDb: trackData.loudnessGainDb,
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
  if (songs === undefined) return;
  const existingTracks = await db.gamePageTrack.findMany({
    where: { gamePageId: pageId },
    select: {
      id: true,
      slug: true,
      url: true,
      integratedLufs: true,
      truePeakDb: true,
      loudnessGainDb: true,
      links: true,
      credits: true,
      ratings: { select: { id: true } },
      timestampComments: { select: { id: true } },
    },
  });

  assertChildIds(existingTracks, songs, "track");

  const existingTrackBySlug = new Map(
    existingTracks.map((track) => [track.slug, track]),
  );
  const retainedTrackIds = new Set<number>();

  for (const [sortOrder, song] of (songs ?? []).entries()) {
    const trackData = requireComposerId(song);
    const slug = String(trackData.slug ?? "").trim();
    if (!slug) continue;
    const existingTrack = song.id ? existingTracks.find(track => track.id === song.id) : existingTrackBySlug.get(slug);
    if (existingTrack) retainedTrackIds.add(existingTrack.id);

    const relationData = {
      tags: song.tagIds === undefined ? undefined : {
        set: trackData.tagIds.map((id) => ({ id })),
      },
      flags: song.flagIds === undefined ? undefined : {
        set: trackData.flagIds.map((id) => ({ id })),
      },
      ...(song.links !== undefined ? { links: reconcileMetadata(existingTrack?.links ?? [], trackData.links, link => link.url) } : {}),
      ...(song.credits !== undefined ? { credits: reconcileMetadata(existingTrack?.credits ?? [], trackData.credits, credit => String(credit.userId)) } : {}),
    };

    if (existingTrack) {
      const preservesExistingAudio = existingTrack.url === trackData.url;
      await db.gamePageTrack.update({
        where: { id: existingTrack.id },
        data: {
          sortOrder,
          name: trackData.name,
          slug: trackData.slug,
          url: trackData.url,
          commentary: trackData.commentary,
          bpm: trackData.bpm,
          musicalKey: trackData.musicalKey,
          integratedLufs:
            trackData.integratedLufs ??
            (preservesExistingAudio ? existingTrack.integratedLufs : null),
          truePeakDb:
            trackData.truePeakDb ??
            (preservesExistingAudio ? existingTrack.truePeakDb : null),
          loudnessGainDb:
            trackData.loudnessGainDb ??
            (preservesExistingAudio ? existingTrack.loudnessGainDb : null),
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
        sortOrder,
        gamePageId: pageId,
        name: trackData.name,
        slug: trackData.slug,
        url: trackData.url,
        commentary: trackData.commentary,
        bpm: trackData.bpm,
        musicalKey: trackData.musicalKey,
        integratedLufs: trackData.integratedLufs,
        truePeakDb: trackData.truePeakDb,
        loudnessGainDb: trackData.loudnessGainDb,
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
    if (retainedTrackIds.has(existingTrack.id)) continue;
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
  if (leaderboards === undefined) return;
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
  assertChildIds(existingLeaderboards, leaderboards, "leaderboard");

  for (const [sortOrder, leaderboard] of (leaderboards ?? []).entries()) {
    const existingLeaderboard = existingLeaderboards.find(
      (entry) => entry.id === leaderboard.id,
    );

    if (existingLeaderboard) {
      await db.gamePageLeaderboard.update({
        where: { id: existingLeaderboard.id },
        data: {
          sortOrder,
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
        sortOrder,
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
    select: {
      id: true,
      playableBuildId: true,
      pageBackground: true,
      playableBuildShowFullscreenButton: true,
      achievements: true,
      downloadLinks: true,
    },
  });

  const pagePayload = buildGamePagePayload(body);
  if (existingPage && body.pageBackground === undefined) {
    pagePayload.pageBackground = existingPage.pageBackground;
  }
  if (
    existingPage &&
    body.playableBuildShowFullscreenButton === undefined
  ) {
    pagePayload.playableBuildShowFullscreenButton =
      existingPage.playableBuildShowFullscreenButton;
  }
  const nextPlayableBuildId = webBuildIdFromUrl(body.playableBuildUrl);
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
    if (body.achievements !== undefined) assertChildIds(existingPage.achievements, body.achievements, "achievement");
    const updateData: Prisma.GamePageUpdateInput = {
      ...sharedData,
      ratingCategories: body.ratingCategories === undefined ? undefined : {
        set: [],
        connect: relationData.ratingCategories,
      },
      majRatingCategories: body.majRatingCategories === undefined ? undefined : {
        set: [],
        connect: relationData.majRatingCategories,
      },
      flags: body.flags === undefined ? undefined : {
        set: [],
        connect: relationData.flags,
      },
      tags: body.tags === undefined ? undefined : {
        set: [],
        connect: relationData.tags,
      },
      ...(body.downloadLinks !== undefined ? { downloadLinks: reconcileMetadata(existingPage.downloadLinks, body.downloadLinks.map(link => ({ url: link.url, platform: link.platform })), link => link.platform) } : {}),
      ...(body.achievements !== undefined ? { achievements: {
        deleteMany: { id: { in: existingPage.achievements.filter(item => !body.achievements!.some(incoming => incoming.id === item.id)).map(item => item.id) } },
        update: body.achievements.filter(item => item.id != null && item.id > 0).map(item => ({ where: { id: item.id! }, data: { name: item.name, description: item.description ?? "", image: item.image ?? "" } })),
        create: body.achievements.filter(item => item.id == null || item.id <= 0).map(item => ({ name: item.name, description: item.description ?? "", image: item.image ?? "" })),
      } } : {}),
      ...(!nextPlayableBuildId
        ? { playableBuild: { disconnect: true } }
        : {}),
    };

    await db.gamePage.update({
      where: { id: existingPage.id },
      data: updateData,
      include: postJamPageInclude,
    });

    await syncGamePageLeaderboards(existingPage.id, body.leaderboards);
    await syncGamePageTracks(existingPage.id, body.songs);
    if (nextPlayableBuildId) {
      await attachWebBuildToPage(existingPage.id, body.playableBuildUrl);
    }
    if (existingPage.playableBuildId !== nextPlayableBuildId) {
      await scheduleWebBuildDeletionIfUnreferenced(existingPage.playableBuildId);
    }
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
      create: (body.songs ?? []).map((song: SongInput, sortOrder) =>
        buildTrackCreateData(song, sortOrder),
      ),
    },
  };

  const createdPage = await db.gamePage.create({
    data: createData,
    include: postJamPageInclude,
  });

  if (nextPlayableBuildId) {
    await attachWebBuildToPage(createdPage.id, body.playableBuildUrl);
  }

  await syncGamePageLeaderboards(createdPage.id, body.leaderboards?.map(({ id: _id, ...leaderboard }) => leaderboard));

  return db.gamePage.findUnique({
    where: { id: createdPage.id },
    include: postJamPageInclude,
  });
}
