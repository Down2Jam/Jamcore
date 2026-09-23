import { GameCategory, PageVersion, type Prisma } from "@prisma/client";

import db from "../../infra/db.js";
import logger from "../../infra/logger.js";
import { buildJamTimeline, getJamPhase, JAM_PHASES } from "../../domain/jamTimeline.js";
import { isActiveGameRating } from "../ratings/active.js";
import { appConfig } from "../../config/app.js";
import { createNotifications } from "./delivery.js";

const REQUIRED_RATINGS = 5;
const GIVEN_RATINGS_CUTOFF = 4.99;
const REMINDER_INTERVAL_MS = 5 * 60_000;

function addCredit(credits: Map<number, number>, userId: number, amount: number) {
  credits.set(userId, (credits.get(userId) ?? 0) + amount);
}

function teamCredit(credits: Map<number, number>, userIds: number[]) {
  return userIds.reduce((sum, id) => sum + (credits.get(id) ?? 0), 0);
}

function reminderTitle(kind: "game" | "track", name: string, received: number) {
  if (received < REQUIRED_RATINGS) {
    return `${name} needs more ratings in order to be ranked!`;
  }
  return kind === "game"
    ? `You need to play and rate more games in order for ${name} to be ranked!`
    : `You need to listen to and rate more songs in order for ${name} to be ranked!`;
}

function reminderBody(kind: "game" | "track", name: string, given: number, received: number) {
  const entry = kind === "game" ? "game" : "song";
  const target = kind === "game" ? "games" : "songs";
  const parts: string[] = [];

  if (received < REQUIRED_RATINGS) {
    parts.push(`Your ${entry} ${name} is currently under the ${REQUIRED_RATINGS} rating requirement in order to be ranked at the end of the jam!`);
  }
  if (given < GIVEN_RATINGS_CUTOFF && received >= REQUIRED_RATINGS) {
    parts.push(`Your team has rated ${Math.floor(given + 0.01)} of the ${REQUIRED_RATINGS} ${target} required in order for your ${entry} ${name} to be ranked at the end of the jam!`);
  }
  if (received < REQUIRED_RATINGS) {
    parts.push(`Rating and giving good feedback to other jam entries will show your ${entry} to more people in order to get enough ratings to get above the requirement.`);
  } else {
    parts.push(`Rating and giving good feedback to other jam entries will help your team get above the requirement and show your ${entry} to more people.`);
  }

  return parts.join(" ");
}

async function buildReminderNotifications(jamId: number, jamSlug: string) {
  const [games, gameRatings, trackRatings, gameCategories, trackCategories] = await Promise.all([
    db.game.findMany({
      where: {
        jamId,
        published: true,
        category: { in: [GameCategory.REGULAR, GameCategory.ODA] },
      },
      select: {
        id: true,
        slug: true,
        team: { select: { users: { select: { id: true } } } },
        pages: {
          where: { version: PageVersion.JAM },
          select: {
            name: true,
            tracks: {
              where: { origin: "ORIGINAL" },
              select: { id: true, slug: true, name: true },
            },
          },
        },
      },
    }),
    db.rating.findMany({
      where: { game: { jamId }, gamePage: { version: PageVersion.JAM } },
      select: {
        gameId: true,
        userId: true,
        categoryId: true,
        category: { select: { always: true } },
        gamePage: { select: { ratingCategories: { select: { id: true } } } },
      },
    }),
    db.trackRating.findMany({
      where: { track: { gamePage: { version: PageVersion.JAM, game: { jamId } } } },
      select: { trackId: true, userId: true, categoryId: true },
    }),
    db.ratingCategory.findMany({ select: { id: true, name: true, always: true } }),
    db.trackRatingCategory.findMany({ where: { always: true }, select: { id: true, name: true } }),
  ]);

  const eligibleRaters = new Set(games.flatMap((game) => game.team.users.map((user) => user.id)));
  const gameOverallId = gameCategories.find((category) => category.name === appConfig.games.ratingCategoryNames.overall)?.id;
  const trackOverallId = trackCategories.find((category) => category.name === appConfig.games.ratingCategoryNames.overallTrack)?.id;
  if (gameOverallId === undefined || trackOverallId === undefined) {
    throw new Error("Overall game or music rating category is missing");
  }
  const alwaysGameCategoryCount = gameCategories.filter((category) => category.always).length;
  const activeTrackCategoryIds = new Set(trackCategories.map((category) => category.id));
  const gameGivenByUser = new Map<number, number>();
  const trackGivenByUser = new Map<number, number>();
  const gameReceived = new Map<number, number>();
  const trackReceived = new Map<number, number>();

  for (const rating of gameRatings) {
    if (!isActiveGameRating(rating)) continue;

    const categoryCount = rating.gamePage.ratingCategories.length + alwaysGameCategoryCount;
    if (categoryCount > 0) addCredit(gameGivenByUser, rating.userId, 1 / categoryCount);
    if (rating.categoryId === gameOverallId && eligibleRaters.has(rating.userId)) {
      addCredit(gameReceived, rating.gameId, 1);
    }
  }

  for (const rating of trackRatings) {
    if (!activeTrackCategoryIds.has(rating.categoryId)) continue;

    if (trackCategories.length > 0) addCredit(trackGivenByUser, rating.userId, 1 / trackCategories.length);
    if (rating.categoryId === trackOverallId && eligibleRaters.has(rating.userId)) {
      addCredit(trackReceived, rating.trackId, 1);
    }
  }

  const notifications: Prisma.NotificationCreateManyInput[] = [];

  for (const game of games) {
    const page = game.pages[0];
    if (!page) continue;

    const userIds = game.team.users.map((user) => user.id);
    const gameGiven = teamCredit(gameGivenByUser, userIds);
    const trackGiven = teamCredit(trackGivenByUser, userIds);
    const gameGotten = gameReceived.get(game.id) ?? 0;

    if (gameGiven < GIVEN_RATINGS_CUTOFF || gameGotten < REQUIRED_RATINGS) {
      for (const recipientId of userIds) {
        notifications.push({
          type: "RATING_REMINDER",
          recipientId,
          gameId: game.id,
          title: reminderTitle("game", page.name, gameGotten),
          body: reminderBody("game", page.name, gameGiven, gameGotten),
          link: gameGiven < GIVEN_RATINGS_CUTOFF ? `/games?jam=${encodeURIComponent(jamSlug)}` : `/g/${game.slug}`,
          data: { jamId, kind: "game", entryId: game.id, ratingsGiven: gameGiven, ratingsReceived: gameGotten },
          dedupeKey: `jam-rating-halfway:${jamId}:game:${game.id}:${recipientId}`,
        });
      }
    }

    for (const track of page.tracks) {
      const trackGotten = trackReceived.get(track.id) ?? 0;
      if (trackGiven >= GIVEN_RATINGS_CUTOFF && trackGotten >= REQUIRED_RATINGS) continue;

      for (const recipientId of userIds) {
        notifications.push({
          type: "RATING_REMINDER",
          recipientId,
          trackId: track.id,
          title: reminderTitle("track", track.name, trackGotten),
          body: reminderBody("track", track.name, trackGiven, trackGotten),
          link: trackGiven < GIVEN_RATINGS_CUTOFF ? `/music?jam=${encodeURIComponent(jamSlug)}` : `/m/${track.slug}`,
          data: { jamId, kind: "track", entryId: track.id, ratingsGiven: trackGiven, ratingsReceived: trackGotten },
          dedupeKey: `jam-rating-halfway:${jamId}:track:${track.id}:${recipientId}`,
        });
      }
    }
  }

  return notifications;
}

async function claimDispatch(jamId: number, mode: "automatic" | "manual") {
  const claimed = mode === "manual"
    ? await db.$queryRaw<Array<{ jam_id: number }>>`
        UPDATE "JamRatingReminderDispatch"
        SET status = 'MANUAL_PROCESSING', updated_at = NOW()
        WHERE jam_id = ${jamId}
          AND (status = 'MANUAL_ELIGIBLE' OR
            (status = 'MANUAL_PROCESSING' AND updated_at < NOW() - INTERVAL '10 minutes'))
        RETURNING jam_id
      `
    : await db.$queryRaw<Array<{ jam_id: number }>>`
        INSERT INTO "JamRatingReminderDispatch" (jam_id, status, updated_at)
        VALUES (${jamId}, 'PROCESSING', NOW())
        ON CONFLICT (jam_id) DO UPDATE
        SET status = 'PROCESSING', updated_at = NOW()
        WHERE "JamRatingReminderDispatch".status = 'PROCESSING'
          AND "JamRatingReminderDispatch".updated_at < NOW() - INTERVAL '10 minutes'
        RETURNING jam_id
      `;

  return claimed.length > 0;
}

export async function sendHalfwayRatingReminders(jamId: number, mode: "automatic" | "manual") {
  const jam = await db.jam.findUnique({ where: { id: jamId } });
  if (!jam || !jam.isActive || jam.sourcePlatform || getJamPhase(jam) !== JAM_PHASES.rating) return false;

  const timeline = buildJamTimeline(jam);
  const midpoint = new Date((timeline.submissionEnd.getTime() + timeline.ratingEnd.getTime()) / 2);
  if (new Date() < midpoint) return false;
  if (!(await claimDispatch(jamId, mode))) return false;

  try {
    const notifications = await buildReminderNotifications(jam.id, jam.slug);
    let sent = 0;

    for (let index = 0; index < notifications.length; index += 250) {
      if (new Date() >= timeline.ratingEnd) throw new Error("The rating period ended before delivery completed");
      const result = await createNotifications(notifications.slice(index, index + 250));
      sent += result.count;
    }

    await db.jamRatingReminderDispatch.update({
      where: { jamId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    logger.info("Halfway rating reminders processed", { jamId, mode, candidates: notifications.length, sent });
    return true;
  } catch (error) {
    if (mode === "manual") {
      await db.jamRatingReminderDispatch.updateMany({
        where: { jamId, status: "MANUAL_PROCESSING" },
        data: { status: "MANUAL_ELIGIBLE" },
      });
    }
    logger.error("Halfway rating reminders failed", { jamId, mode, error });
    throw error;
  }
}

export async function runDueHalfwayRatingReminders() {
  const jams = await db.jam.findMany({
    where: { isActive: true, sourcePlatform: null },
    select: { id: true },
  });

  for (const jam of jams) {
    try {
      await sendHalfwayRatingReminders(jam.id, "automatic");
    } catch (error) {
      logger.warn("Could not process jam rating reminders", { jamId: jam.id, error });
    }
  }
}

export async function runCurrentJamRatingReminderCatchup() {
  const eligible = await db.jamRatingReminderDispatch.findMany({
    where: { status: { in: ["MANUAL_ELIGIBLE", "MANUAL_PROCESSING"] } },
    select: { jamId: true },
  });
  if (eligible.length !== 1) {
    throw new Error(`Expected one manually eligible jam; found ${eligible.length}`);
  }

  const delivered = await sendHalfwayRatingReminders(eligible[0].jamId, "manual");
  if (!delivered) throw new Error("The marked jam is no longer in its rating period or has already been processed");
  return eligible[0].jamId;
}

export function startHalfwayRatingReminderRuntime() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDueHalfwayRatingReminders();
    } catch (error) {
      logger.error("Halfway rating reminder scan failed", { error });
    } finally {
      running = false;
    }
  };
  const interval = setInterval(() => void tick(), REMINDER_INTERVAL_MS);
  interval.unref?.();
  void tick();

  return {
    name: "halfway-rating-reminders",
    stop: () => clearInterval(interval),
  };
}
