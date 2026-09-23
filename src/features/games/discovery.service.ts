import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { EXTERNAL_GAME_CATEGORY } from "../../domain/gamePolicies.js";
import { gamePageInclude, materializeGamePage } from "./page.helpers.js";
import { z } from "zod";

const DEFAULT_FEATURED_VIDEO_LIMIT = 10;
const MAX_FEATURED_VIDEO_LIMIT = 50;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const featuredGameVideosQuerySchema = z.object({
  limit: z.unknown().optional(),
  jamId: z.coerce.number().int().positive().optional(),
});

function normalizeFeaturedVideoLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed)) return DEFAULT_FEATURED_VIDEO_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_FEATURED_VIDEO_LIMIT);
}

function extractYouTubeId(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate: string | null = null;

    if (hostname === "youtu.be") {
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtube-nocookie.com" ||
      hostname.endsWith(".youtube-nocookie.com")
    ) {
      candidate =
        url.searchParams.get("v") ??
        url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ??
        null;
    }

    return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export async function listFeaturedGameVideos({
  limit,
  tenantId,
  jamId,
}: {
  limit?: unknown;
  tenantId?: string | null;
  jamId?: number;
}) {
  const normalizedLimit = normalizeFeaturedVideoLimit(limit);
  const candidateLimit = normalizedLimit * 10;
  const candidates = await db.$queryRaw<
    Array<{ gameId: number; gameName: string; trailerUrl: string }>
  >`
    WITH eligible AS (
      SELECT DISTINCT ON (g.id)
        g.id AS "gameId",
        gp.name AS "gameName",
        gp."trailerUrl"
      FROM "Game" g
      INNER JOIN "GamePage" gp ON gp."gameId" = g.id
      WHERE g.published = TRUE
        AND (${jamId ?? null}::integer IS NULL OR g."jamId" = ${jamId ?? null})
        AND gp."trailerUrl" IS NOT NULL
        AND BTRIM(gp."trailerUrl") <> ''
        AND (
          ${tenantId ?? null}::text IS NULL
          OR g.tenant_id IS NULL
          OR g.tenant_id = ${tenantId ?? null}
        )
      ORDER BY
        g.id,
        CASE gp.version::text WHEN 'POST_JAM' THEN 0 ELSE 1 END,
        gp."updatedAt" DESC
    )
    SELECT *
    FROM eligible
    ORDER BY RANDOM()
    LIMIT ${candidateLimit}
  `;

  const seen = new Set<string>();
  const videos = [];

  for (const candidate of candidates) {
    const videoId = extractYouTubeId(candidate.trailerUrl);
    if (!videoId || seen.has(videoId)) continue;

    seen.add(videoId);
    videos.push({
      gameId: candidate.gameId,
      gameName: candidate.gameName,
      trailerUrl: candidate.trailerUrl,
      videoId,
    });
    if (videos.length >= normalizedLimit) break;
  }

  return videos;
}

export async function getRandomPublishedGame(
  tenantId?: string | null,
  includeExternal = true,
) {
  const game = await db.$queryRaw<
    { id: number; name: string; jamId: number; activeJamGame: boolean }[]
  >`
    WITH active_jams AS (
      SELECT j.id
      FROM "Jam" j
      WHERE j."source_platform" IS NULL
        AND NOW() >= j."startTime"
        AND NOW() < j."startTime"
          + (COALESCE(j."jammingHours", 0)
             + COALESCE(j."submissionHours", 0)
             + COALESCE(j."ratingHours", 0)) * INTERVAL '1 hour'
        AND EXISTS (
          SELECT 1
          FROM "Game" active_game
          WHERE active_game."jamId" = j.id
            AND active_game."published" = TRUE
            AND (
              ${includeExternal}
              OR active_game."category"::text <> ${EXTERNAL_GAME_CATEGORY}
            )
        )
    )
    SELECT g.*, EXISTS (SELECT 1 FROM active_jams) AS "activeJamGame"
    FROM "Game" g
    WHERE g."published" = TRUE
      AND (${includeExternal} OR g."category"::text <> ${EXTERNAL_GAME_CATEGORY})
      AND (
        NOT EXISTS (SELECT 1 FROM active_jams)
        OR g."jamId" IN (SELECT id FROM active_jams)
      )
    ORDER BY RANDOM()
    LIMIT 1
  `;

  if (!game[0]) {
    return null;
  }

  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [game[0].id],
    tenantId,
  });

  return allowedIds.includes(game[0].id) ? game[0] : null;
}

export async function listCurrentUserGames({
  userId,
  jamId,
}: {
  userId: number;
  jamId: number;
}) {
  const games = await db.game.findMany({
    where: {
      team: {
        users: {
          some: {
            id: userId,
          },
        },
      },
      jamId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      pages: {
        where: {
          version: {
            in: ["JAM", "POST_JAM"],
          },
        },
        include: gamePageInclude,
      },
    },
  });

  return games.map((game) => ({
    ...materializeGamePage(game),
    jamPage: game.pages.find((page) => page.version === "JAM") ?? null,
    postJamPage: game.pages.find((page) => page.version === "POST_JAM") ?? null,
  }));
}
