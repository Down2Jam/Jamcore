import { writeAuditEntry } from "../../infra/audit.js";
import { clearGameDetailCache } from "./detail.service.js";
import { clearJamServiceCaches } from "../jams/service.js";
import { buildJamTimeline } from "../../domain/jamTimeline.js";
import { clearGameListingCache } from "./listing.service.js";
import { reconcileMetadata } from "../../lib/reconcileChildren.js";
import { PageVersion } from "@prisma/client";

import { JAM_PHASES } from "../../domain/jamTimeline.js";
import db from "../../infra/db.js";
import { hasResourceGrant } from "../../lib/resourceAuthorization.js";
import { enqueueSearchEntityIndex } from "../search/indexing.service.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../lib/errors.js";
import type { GameMutationBody } from "../../types/game.js";
import {
  publishGameCreated,
  publishGameUpdated,
} from "../federation/index.js";
import { notifyNewMentions } from "../mentions/notifications.service.js";
import { canChangeGameCategory } from "./policies.js";
import { buildPrefix } from "./prefix.js";
import {
  buildPostJamBodyFromGame,
  getJamPage,
  getPostJamPage,
  postJamPageInclude,
  upsertGamePage,
} from "./page.service.js";
import { ITCH_EMBED_ASPECT_RATIOS, updateGameSchema } from "./write.schemas.js";
import { jamAndPostJamVersions } from "../../prisma/selects.js";
import { assertWebBuildCanAttach } from "./web-build.service.js";

const itchEmbedAspectRatios = new Set(ITCH_EMBED_ASPECT_RATIOS);

type GameMutationActor = {
  id: number;
  name: string;
  slug: string;
  mod?: boolean | null;
};

async function findGameForMutation(gameSlug: string) {
  return db.game.findUnique({
    where: { slug: gameSlug },
    include: {
      jam: true,
      ratingCategories: true,
      majRatingCategories: true,
      tags: true,
      flags: true,
      downloadLinks: true,
      team: {
        include: {
          owner: {
            select: {
              id: true,
              slug: true,
            },
          },
          users: {
            select: {
              id: true,
            },
          },
        },
      },
      pages: {
        where: {
          version: {
            in: jamAndPostJamVersions,
          },
        },
        include: postJamPageInclude,
      },
    },
  });
}

function assertCanMutateGame(
  existingGame: Awaited<ReturnType<typeof findGameForMutation>>,
  actor: GameMutationActor | null | undefined,
  grants?: Array<{
    role: string;
    resourceType?: string | null;
    resourceId?: string | null;
  }>,
) {
  if (!actor) {
    throw new UnauthorizedError("User missing.");
  }

  if (actor.mod) {
    return;
  }

  if (
    hasResourceGrant({
      grants,
      resourceType: "game",
      resourceId: existingGame?.id ?? "",
    })
  ) {
    return;
  }

  const teamUserIds = existingGame?.team?.users.map((user) => user.id) ?? [];
  if (!teamUserIds.includes(actor.id)) {
    throw new ForbiddenError("Not allowed to edit this game.");
  }
}

export async function updateGameBySlug({
  gameSlug,
  body,
  jamPhase,
  actor,
  grants,
}: {
  gameSlug: string;
  body: GameMutationBody;
  jamPhase?: string;
  actor?: GameMutationActor | null;
  grants?: Array<{
    role: string;
    resourceType?: string | null;
    resourceId?: string | null;
  }>;
}) {
  const {
    name,
    slug,
    description,
    downloadLinks,
    category,
    ratingCategories,
    majRatingCategories,
    published,
    flags,
    tags,
    emotePrefix,
    pageVersion,
    userSlug,
    itchEmbedAspectRatio,
  } = body;
  const normalizedDownloadLinks = downloadLinks ?? [];
  const normalizedFlags = flags ?? [];
  const normalizedTags = tags ?? [];
  const targetPageVersion =
    pageVersion === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM;

  if (!name || !category) {
    throw new BadRequestError("Name is required.");
  }

  if (
    itchEmbedAspectRatio != null &&
    !itchEmbedAspectRatios.has(
      itchEmbedAspectRatio as (typeof ITCH_EMBED_ASPECT_RATIOS)[number],
    )
  ) {
    throw new BadRequestError("Invalid itch embed aspect ratio.");
  }

  const existingGame = await findGameForMutation(gameSlug);
  if (!existingGame) {
    throw new NotFoundError("Game not found.");
  }

  assertCanMutateGame(existingGame, actor, grants);
  await assertWebBuildCanAttach(
    body.playableBuildUrl,
    actor!.id,
    existingGame.pages.map((page) => page.playableBuildUrl),
  );

  const selectedPage = targetPageVersion === PageVersion.POST_JAM
    ? getPostJamPage(existingGame) : getJamPage(existingGame);
  const previousCategories = selectedPage?.ratingCategories ?? existingGame.ratingCategories;
  const previousMajorityCategories = selectedPage?.majRatingCategories ?? existingGame.majRatingCategories;
  const changed = (next: number[] | undefined, previous: Array<{ id: number }>) =>
    next !== undefined && (new Set(next).size !== previous.length || previous.some((entry) => !next.includes(entry.id)));
  const categoriesChanged = changed(ratingCategories, previousCategories) || changed(majRatingCategories, previousMajorityCategories);

  if (categoriesChanged) {
    const timeline = buildJamTimeline(existingGame.jam);
    const deadline = targetPageVersion === PageVersion.JAM ? timeline.ratingEnd : timeline.postJamRatingEnd;
    if (new Date() >= deadline) {
      throw new BadRequestError("Rating categories cannot be changed after rating closes.");
    }
    const selectedIds = ratingCategories ?? previousCategories.map((entry) => entry.id);
    const optionalCategories = await db.ratingCategory.findMany({ where: { id: { in: selectedIds }, always: false } });
    if (optionalCategories.length !== new Set(selectedIds).size) {
      throw new BadRequestError("Select valid optional rating categories.");
    }
    body.ratingCategories = [...new Set(selectedIds)];
    body.majRatingCategories = (majRatingCategories ?? previousMajorityCategories.map((entry) => entry.id))
      .filter((id) => optionalCategories.some((entry) => entry.id === id && entry.askMajorityContent));
  }

  const recordCategoryChange = async () => {
    if (!categoriesChanged) return;
    await writeAuditEntry({
      action: "game.ratingCategories.updated",
      actor: { type: "user", id: actor!.id, slug: actor!.slug },
      resource: `game:${existingGame.id}`,
      metadata: {
        pageVersion: targetPageVersion,
        previous: previousCategories.map((entry) => entry.id),
        next: body.ratingCategories,
        previousMajority: previousMajorityCategories.map((entry) => entry.id),
        nextMajority: body.majRatingCategories,
      },
    });
  };

  const currentVersionCategory = existingGame.category;

  if (
    !canChangeGameCategory({
      jamPhase,
      targetPageVersion:
        targetPageVersion === PageVersion.POST_JAM ? "POST_JAM" : "JAM",
      previousCategory: currentVersionCategory,
      nextCategory: category,
    })
  ) {
    throw new BadRequestError(
      targetPageVersion === PageVersion.JAM && jamPhase === JAM_PHASES.rating
        ? "Can't update category outside of jamming period."
        : "Can't update category during post-jam phases.",
    );
  }

  if (targetPageVersion === PageVersion.POST_JAM) {
    await upsertGamePage(existingGame.id, PageVersion.POST_JAM, body);
    await clearGameListingCache();
    await clearGameDetailCache();
    await clearJamServiceCaches();
    await recordCategoryChange();
    await enqueueSearchEntityIndex({
      entityType: "game",
      entityId: existingGame.id,
    });
    return db.game.findUnique({
      where: { slug: gameSlug },
      include: {
        pages: {
          where: {
            version: {
              in: jamAndPostJamVersions,
            },
          },
          include: postJamPageInclude,
        },
      },
    });
  }

  const disconnectTags = existingGame.tags.filter(
    (entry) => !normalizedTags.includes(entry.id),
  );
  const newTags = normalizedTags.filter(
    (entry: number) =>
      existingGame.tags.filter((tag) => tag.id === entry).length === 0,
  );
  const disconnectFlags = existingGame.flags.filter(
    (entry) => !normalizedFlags.includes(entry.id),
  );
  const newFlags = normalizedFlags.filter(
    (entry: number) =>
      existingGame.flags.filter((flag) => flag.id === entry).length === 0,
  );

  const oldPrefix = getJamPage(existingGame)?.emotePrefix ?? null;
  let prefixUpdates: Array<{ id: number; slug: string }> | null = null;
  let cleanedPrefix = emotePrefix
    ? String(emotePrefix).trim().toLowerCase()
    : null;
  if (cleanedPrefix) {
    if (!/^[a-z0-9]{4,8}$/.test(cleanedPrefix)) {
      throw new BadRequestError("Emote prefix must be 4 to 8 characters.");
    }
  } else {
    cleanedPrefix = buildPrefix(slug || existingGame.slug);
  }

  if (cleanedPrefix && cleanedPrefix !== oldPrefix) {
    const gameReactions = await db.reaction.findMany({
      where: {
        scopeType: "GAME",
        scopeGameId: existingGame.id,
      },
      select: { id: true, slug: true },
    });

    if (gameReactions.length > 0) {
      const suffixLength = oldPrefix ? oldPrefix.length : 6;
      prefixUpdates = gameReactions.map((reaction) => ({
        id: reaction.id,
        slug: `${cleanedPrefix}${reaction.slug.slice(suffixLength)}`,
      }));

      const nextSlugs = prefixUpdates.map((update) => update.slug);
      if (new Set(nextSlugs).size !== nextSlugs.length) {
        throw new ConflictError("Emote prefix causes duplicates.");
      }

      const conflicts = await db.reaction.findMany({
        where: {
          slug: { in: nextSlugs },
          NOT: { id: { in: prefixUpdates.map((update) => update.id) } },
        },
        select: { id: true },
      });

      if (conflicts.length > 0) {
        throw new ConflictError("Emote prefix already in use.");
      }
    }
  }

  const updatedGame = await db.game.update({
    where: { slug: gameSlug },
    data: {
      slug,
      ...(downloadLinks !== undefined ? { downloadLinks: reconcileMetadata(existingGame.downloadLinks, normalizedDownloadLinks.map(link => ({ url: link.url, platform: link.platform })), link => link.platform) } : {}),
      tags: tags === undefined ? undefined : {
        disconnect: disconnectTags.map((entry) => ({ id: entry.id })),
        connect: newTags.map((entry: number) => ({ id: entry })),
      },
      flags: flags === undefined ? undefined : {
        disconnect: disconnectFlags.map((entry) => ({ id: entry.id })),
        connect: newFlags.map((entry: number) => ({ id: entry })),
      },
      category,
      published,
      publishedAt:
        published && !existingGame.published ? new Date() : existingGame.publishedAt,
    },
    include: {
      downloadLinks: true,
    },
  });

  const mentionActor =
    actor ??
    (userSlug
      ? await db.user.findUnique({
          where: { slug: userSlug },
          select: { id: true, name: true, slug: true },
        })
      : null);

  if (mentionActor) {
    await notifyNewMentions({
      type: "game",
      actorId: mentionActor.id,
      actorName: mentionActor.name,
      actorSlug: mentionActor.slug,
      beforeContent: getJamPage(existingGame)?.description ?? "",
      afterContent: description,
      gameId: updatedGame.id,
      gameSlug: updatedGame.slug,
      gameName: name,
    });
  }

  if (prefixUpdates && prefixUpdates.length > 0) {
    await db.$transaction(
      prefixUpdates.map((update) =>
        db.reaction.update({
          where: { id: update.id },
          data: { slug: update.slug },
        }),
      ),
    );
  }

  await upsertGamePage(updatedGame.id, PageVersion.JAM, body);
  await clearGameListingCache();
  await clearGameDetailCache();
  await clearJamServiceCaches();
  await recordCategoryChange();

  if (updatedGame.published) {
    if (updatedGame.slug === gameSlug && existingGame.published) {
      await publishGameUpdated(updatedGame.slug);
    } else {
      await publishGameCreated(updatedGame.slug);
    }
  }

  await enqueueSearchEntityIndex({
    entityType: "game",
    entityId: updatedGame.id,
  });

  return updatedGame;
}

export async function createPostJamPage(
  gameSlug: string,
  actor?: GameMutationActor | null,
  grants?: Array<{
    role: string;
    resourceType?: string | null;
    resourceId?: string | null;
  }>,
) {
  const existingGame = await findGameForMutation(gameSlug);
  if (!existingGame) {
    throw new NotFoundError("Game not found.");
  }

  assertCanMutateGame(existingGame, actor, grants);

  if (existingGame.category === "EXTERNAL") {
    throw new BadRequestError("External games do not have post-jam pages.");
  }

  if (!getPostJamPage(existingGame)) {
    await upsertGamePage(
      existingGame.id,
      PageVersion.POST_JAM,
      buildPostJamBodyFromGame(
        existingGame as unknown as Parameters<typeof buildPostJamBodyFromGame>[0],
      ),
    );
    await clearGameListingCache();
    await clearGameDetailCache();
    await clearJamServiceCaches();
    await enqueueSearchEntityIndex({
      entityType: "game",
      entityId: existingGame.id,
    });

    return db.game.findUnique({
      where: { slug: gameSlug },
      include: {
        pages: {
          where: {
            version: {
              in: [PageVersion.JAM, PageVersion.POST_JAM],
            },
          },
          include: postJamPageInclude,
        },
      },
    });
  }

  await enqueueSearchEntityIndex({
    entityType: "game",
    entityId: existingGame.id,
  });

  return existingGame;
}

export { updateGameSchema };
