import { PageVersion } from "@prisma/client";
import { z } from "zod";

import { assignCoreEntityTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { BadRequestError } from "../../lib/errors.js";
import { notifyNewMentions } from "../mentions/notifications.service.js";
import { notifyFollowers } from "../social/index.js";
import { enqueueSearchEntityIndex } from "../search/indexing.service.js";
import { publishGameCreated } from "../federation/index.js";
import { buildTrackWriteData } from "../tracks/write.js";
import { buildPrefix } from "./prefix.js";
import { createGameSchema, trackInputSchema } from "./write.schemas.js";

function createTrackCreateData(song: z.infer<typeof trackInputSchema>) {
  const trackData = buildTrackWriteData(song);

  if (trackData.composerId == null) {
    throw new BadRequestError("Track composer is required.");
  }

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
      connect: trackData.tagIds.map((id: number) => ({ id })),
    },
    flags: {
      connect: trackData.flagIds.map((id: number) => ({ id })),
    },
    links: {
      create: trackData.links,
    },
    credits: {
      create: trackData.credits,
    },
  };
}

export async function createGame({
  actorUser,
  jam,
  targetTeam,
  input,
  tenantId,
}: {
  actorUser: any;
  jam: any;
  targetTeam: any;
  input: z.infer<typeof createGameSchema>;
  tenantId?: string;
}) {
  const cleanedPrefix = input.emotePrefix?.trim().toLowerCase() || buildPrefix(input.slug);

  const game = await db.game.create({
    data: {
      slug: input.slug,
      jamId: jam.id,
      downloadLinks: {
        create: input.downloadLinks.map((link) => ({
          url: link.url,
          platform: link.platform,
        })),
      },
      ratingCategories: {
        connect: input.ratingCategories.map((id) => ({ id })),
      },
      majRatingCategories: {
        connect: input.majRatingCategories.map((id) => ({ id })),
      },
      teamId: targetTeam.id,
      category: input.category,
      published: input.published,
      tags: {
        connect: input.tags.map((id) => ({ id })),
      },
      flags: {
        connect: input.flags.map((id) => ({ id })),
      },
    },
    include: {
      downloadLinks: true,
    },
  });
  if (tenantId) {
    await assignCoreEntityTenant({
      entityType: "Game",
      entityId: game.id,
      tenantId,
    });
  }

  await db.gamePage.create({
    data: {
      version: PageVersion.JAM,
      name: input.name,
      description: input.description,
      short: input.short,
      thumbnail: input.thumbnail,
      banner: input.banner,
      screenshots: input.screenshots,
      trailerUrl: input.trailerUrl,
      itchEmbedUrl: input.itchEmbedUrl,
      itchEmbedAspectRatio: input.itchEmbedAspectRatio,
      inputMethods: input.inputMethods,
      estOneRun: input.estOneRun,
      estAnyPercent: input.estAnyPercent,
      estHundredPercent: input.estHundredPercent,
      themeJustification: input.themeJustification,
      emotePrefix: cleanedPrefix,
      game: {
        connect: { id: game.id },
      },
      ratingCategories: {
        connect: input.ratingCategories.map((id) => ({ id })),
      },
      majRatingCategories: {
        connect: input.majRatingCategories.map((id) => ({ id })),
      },
      tags: {
        connect: input.tags.map((id) => ({ id })),
      },
      flags: {
        connect: input.flags.map((id) => ({ id })),
      },
      downloadLinks: {
        create: input.downloadLinks.map((link) => ({
          url: link.url,
          platform: link.platform,
        })),
      },
      achievements: {
        create: input.achievements.map((achievement) => ({
          name: achievement.name,
          description: achievement.description ?? "",
          image: achievement.image ?? "",
        })),
      },
      leaderboards: {
        create: input.leaderboards.map((leaderboard) => ({
          type: leaderboard.type,
          name: leaderboard.name,
          onlyBest: leaderboard.onlyBest,
          maxUsersShown: leaderboard.maxUsersShown ?? undefined,
          decimalPlaces: leaderboard.decimalPlaces ?? undefined,
        })),
      },
      tracks: {
        create: input.songs.map(createTrackCreateData),
      },
    },
  });

  await notifyNewMentions({
    type: "game",
    actorId: actorUser.id,
    actorName: actorUser.name,
    actorSlug: actorUser.slug,
    beforeContent: "",
    afterContent: input.description ?? "",
    gameId: game.id,
    gameSlug: game.slug,
    gameName: input.name,
  });

  if (game.published) {
    await publishGameCreated(game.slug);
    await notifyFollowers({
      authorId: actorUser.id,
      tenantId,
      type: "GENERAL",
      title: `${actorUser.name} published a game`,
      body: input.name,
      link: `/games/${game.slug}`,
      data: { kind: "game", gameId: game.id },
    });
  }

  await enqueueSearchEntityIndex({
    entityType: "game",
    entityId: game.id,
    tenantId,
  });

  return game;
}

export { createGameSchema };
