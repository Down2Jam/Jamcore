import { randomUUID } from "node:crypto";
import { z } from "zod";

import { appConfig } from "../../config/app.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { getRadioListenerCount, broadcastRadioEvent } from "./events.js";

const DEFAULT_TRACK_DURATION_SECONDS = 180;
const VOTE_OPTION_COUNT = 3;
const HISTORY_LIMIT = 12;
const radioStationSchema = z.enum(["all", "safe"]);
export type RadioStation = z.infer<typeof radioStationSchema>;

type RadioActor = {
  id: number;
  slug: string;
  name: string;
  mod?: boolean | null;
  admin?: boolean | null;
};

type RadioSessionRow = {
  tenantId: string;
  enabled: boolean;
  currentTrackId: number | null;
  startedAt: Date | null;
  durationSeconds: number;
  voteRound: string;
  voteOptions: unknown;
  history: unknown;
  updatedAt: Date;
};

type RadioEmoteRow = {
  id: string;
  userId: number;
  userSlug: string;
  userName: string;
  emote: string;
  x: number | null;
  y: number | null;
  createdAt: Date;
};

export const radioVoteSchema = z.object({
  trackId: z.coerce.number().int().positive(),
  station: radioStationSchema.optional().default("all"),
});

export const radioEmoteSchema = z.object({
  emote: z.string().trim().min(1).max(64),
  station: radioStationSchema.optional().default("all"),
  x: z.coerce.number().min(0).max(1).optional(),
  y: z.coerce.number().min(0).max(1).optional(),
});

export const radioAdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("regenerate-options") }),
  z.object({
    action: z.literal("ban-track"),
    trackId: z.coerce.number().int().positive(),
    reason: z.string().trim().max(1000).optional().nullable(),
  }),
  z.object({
    action: z.literal("set-enabled"),
    enabled: z.boolean(),
  }),
]);

function resolvedTenantId(tenantId?: string | null) {
  return tenantId ?? appConfig.platform.multiTenant.defaultTenantId;
}

export function resolveRadioStation(value?: string | null): RadioStation {
  return radioStationSchema.catch("all").parse(value);
}

function radioTenantKey(tenantId?: string | null, station: RadioStation = "all") {
  const normalizedTenantId = resolvedTenantId(tenantId);
  return station === "all" ? normalizedTenantId : `${normalizedTenantId}:radio:${station}`;
}

function parseJsonArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter(Number.isFinite);
  }
  if (typeof value === "string") {
    try {
      return parseJsonArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

async function getSession(tenantId: string) {
  return db.radioSession.findUnique({ where: { tenantId } });
}

async function saveSession(input: {
  tenantId: string;
  enabled?: boolean;
  currentTrackId?: number | null;
  startedAt?: Date | null;
  durationSeconds?: number;
  voteRound?: string;
  voteOptions?: number[];
  history?: number[];
}) {
  await db.radioSession.upsert({
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      enabled: input.enabled ?? true,
      currentTrackId: input.currentTrackId ?? null,
      startedAt: input.startedAt ?? null,
      durationSeconds: input.durationSeconds ?? DEFAULT_TRACK_DURATION_SECONDS,
      voteRound: input.voteRound ?? `${input.tenantId}:initial`,
      voteOptions: input.voteOptions ?? [],
      history: input.history ?? [],
    },
    update: {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.currentTrackId !== undefined ? { currentTrackId: input.currentTrackId } : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
      ...(input.voteRound !== undefined ? { voteRound: input.voteRound } : {}),
      ...(input.voteOptions !== undefined ? { voteOptions: input.voteOptions } : {}),
      ...(input.history !== undefined ? { history: input.history } : {}),
      updatedAt: new Date(),
    },
  });
}

async function getBannedTrackIds(tenantId: string) {
  const rows = await db.radioBan.findMany({
    where: { tenantId },
    select: { trackId: true },
  });
  return rows.map((row) => row.trackId);
}

async function getEligibleTracks(
  tenantId: string,
  excludeIds: number[] = [],
  station: RadioStation = "all",
) {
  const banned = await getBannedTrackIds(radioTenantKey(tenantId, station));
  const excluded = new Set([...excludeIds, ...banned]);
  const tracks = await db.gamePageTrack.findMany({
    where: {
      url: { not: "" },
      gamePage: {
        game: {
          published: true,
        },
      },
    },
    select: {
      id: true,
      slug: true,
      url: true,
      name: true,
      license: true,
      allowBackgroundUse: true,
      allowDownload: true,
      composer: { select: { id: true, slug: true, name: true } },
      gamePage: {
        select: {
          name: true,
          thumbnail: true,
          banner: true,
          screenshots: true,
          game: {
            select: {
              id: true,
              slug: true,
              published: true,
            },
          },
        },
      },
    },
    orderBy: { id: "desc" },
    take: 500,
  });
  const allowedGameIds = new Set(
    await filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: tracks.map((track) => track.gamePage.game.id),
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
  );
  const tenantTracks = tracks.filter(
    (track) => allowedGameIds.has(track.gamePage.game.id) && !excluded.has(track.id),
  );
  if (station === "safe") {
    return tenantTracks.filter((track) => track.allowBackgroundUse);
  }
  const licensed = tenantTracks.filter((track) => track.allowBackgroundUse || track.allowDownload);
  return licensed.length >= VOTE_OPTION_COUNT ? licensed : tenantTracks;
}

function pickRandomTracks<T extends { id: number }>(tracks: T[], count: number) {
  const pool = [...tracks];
  const picked: T[] = [];
  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    const [track] = pool.splice(index, 1);
    if (track) picked.push(track);
  }
  return picked;
}

async function getTrackSummaries(trackIds: number[]) {
  if (trackIds.length === 0) return [];
  const tracks = await db.gamePageTrack.findMany({
    where: { id: { in: trackIds } },
    select: {
      id: true,
      slug: true,
      url: true,
      name: true,
      license: true,
      allowDownload: true,
      allowBackgroundUse: true,
      composer: { select: { id: true, slug: true, name: true } },
      gamePage: {
        select: {
          name: true,
          thumbnail: true,
          banner: true,
          screenshots: true,
          game: {
            select: {
              id: true,
              slug: true,
            },
          },
        },
      },
    },
  });
  const byId = new Map(tracks.map((track) => [track.id, track]));
  return trackIds.map((id) => byId.get(id)).filter(Boolean);
}

async function countVotes(tenantId: string, voteRound: string) {
  const rows = await db.radioVote.groupBy({
    by: ["trackId"],
    where: { tenantId, voteRound },
    _count: { trackId: true },
  });
  return new Map(rows.map((row) => [row.trackId, row._count.trackId]));
}

async function getRecentEmotes(tenantId: string) {
  const emotes = await db.radioEmote.findMany({
    where: {
      tenantId,
      createdAt: { gt: new Date(Date.now() - 60_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(emotes.map((emote) => emote.userId))] } },
    select: { id: true, slug: true, name: true },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));
  return emotes
    .map((emote): RadioEmoteRow | null => {
      const user = usersById.get(emote.userId);
      if (!user) return null;
      return {
        id: emote.id,
        userId: emote.userId,
        userSlug: user.slug,
        userName: user.name,
        emote: emote.emote,
        x: emote.x,
        y: emote.y,
        createdAt: emote.createdAt,
      };
    })
    .filter((emote): emote is RadioEmoteRow => Boolean(emote));
}

async function ensureRadioSession(tenantId: string, station: RadioStation = "all") {
  const sessionTenantId = radioTenantKey(tenantId, station);
  const existing = await getSession(sessionTenantId);
  if (existing?.currentTrackId) {
    return existing;
  }
  const options = pickRandomTracks(await getEligibleTracks(tenantId, [], station), VOTE_OPTION_COUNT + 1);
  const [current, ...voteOptions] = options;
  if (!current) {
    throw new NotFoundError("No eligible radio tracks found");
  }
  const voteRound = randomUUID();
  await saveSession({
    tenantId: sessionTenantId,
    currentTrackId: current.id,
    startedAt: new Date(),
    durationSeconds: DEFAULT_TRACK_DURATION_SECONDS,
    voteRound,
    voteOptions: voteOptions.slice(0, VOTE_OPTION_COUNT).map((track) => track.id),
    history: [current.id],
  });
  return (await getSession(sessionTenantId))!;
}

async function presentRadioState(session: RadioSessionRow, actor?: RadioActor | null) {
  const tenantId = session.tenantId;
  const voteOptionIds = parseJsonArray(session.voteOptions);
  const currentTrack = session.currentTrackId
    ? (await getTrackSummaries([session.currentTrackId]))[0] ?? null
    : null;
  const voteOptions = await getTrackSummaries(voteOptionIds);
  const voteCounts = await countVotes(tenantId, session.voteRound);
  const userVote = actor
    ? await db.radioVote.findUnique({
        where: { tenantId_voteRound_userId: { tenantId, voteRound: session.voteRound, userId: actor.id } },
        select: { trackId: true },
      })
    : null;
  const startedAtMs = session.startedAt?.getTime() ?? Date.now();
  const endsAtMs = startedAtMs + session.durationSeconds * 1000;

  return {
    enabled: session.enabled,
    serverTime: new Date().toISOString(),
    listenerCount: getRadioListenerCount(tenantId),
    current: currentTrack
      ? {
          track: currentTrack,
          startedAt: session.startedAt?.toISOString() ?? null,
          endsAt: new Date(endsAtMs).toISOString(),
          durationSeconds: session.durationSeconds,
          offsetSeconds: Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
        }
      : null,
    voting: {
      round: session.voteRound,
      options: voteOptions.filter((track): track is NonNullable<typeof track> => Boolean(track)).map((track) => ({
        track,
        votes: voteCounts.get(track.id) ?? 0,
      })),
      userVoteTrackId: userVote?.trackId ?? null,
      closesAt: new Date(Math.max(Date.now(), endsAtMs - 5000)).toISOString(),
    },
    recentEmotes: await getRecentEmotes(tenantId),
  };
}

export async function getRadioState({
  tenantId,
  actor,
  station = "all",
}: {
  tenantId?: string | null;
  actor?: RadioActor | null;
  station?: RadioStation;
}) {
  const normalizedTenantId = resolvedTenantId(tenantId);
  const session = await ensureRadioSession(normalizedTenantId, station);
  const startedAtMs = session.startedAt?.getTime() ?? 0;
  if (
    session.currentTrackId &&
    startedAtMs > 0 &&
    Date.now() >= startedAtMs + session.durationSeconds * 1000
  ) {
    await advanceRadioIfNeeded(normalizedTenantId, false, station);
    const advancedSession = await ensureRadioSession(normalizedTenantId, station);
    return presentRadioState(advancedSession, actor);
  }
  return presentRadioState(session, actor);
}

export async function saveRadioVote({
  tenantId,
  actor,
  input,
}: {
  tenantId?: string | null;
  actor: RadioActor;
  input: z.infer<typeof radioVoteSchema>;
}) {
  const normalizedTenantId = resolvedTenantId(tenantId);
  const station = input.station;
  const session = await ensureRadioSession(normalizedTenantId, station);
  const options = parseJsonArray(session.voteOptions);
  if (!session.enabled) throw new ForbiddenError("Radio is disabled");
  if (!options.includes(input.trackId)) {
    throw new BadRequestError("Track is not a current vote option");
  }

  const sessionTenantId = radioTenantKey(normalizedTenantId, station);
  await db.radioVote.upsert({
    where: {
      tenantId_voteRound_userId: {
        tenantId: sessionTenantId,
        voteRound: session.voteRound,
        userId: actor.id,
      },
    },
    create: {
      id: randomUUID(),
      tenantId: sessionTenantId,
      voteRound: session.voteRound,
      userId: actor.id,
      trackId: input.trackId,
    },
    update: {
      trackId: input.trackId,
      updatedAt: new Date(),
    },
  });
  const state = await getRadioState({ tenantId: normalizedTenantId, actor, station });
  broadcastRadioEvent(radioTenantKey(normalizedTenantId, station), { type: "vote.updated", payload: state.voting });
  return state;
}

export async function sendRadioEmote({
  tenantId,
  actor,
  input,
}: {
  tenantId?: string | null;
  actor: RadioActor;
  input: z.infer<typeof radioEmoteSchema>;
}) {
  const normalizedTenantId = resolvedTenantId(tenantId);
  const station = input.station;
  const session = await ensureRadioSession(normalizedTenantId, station);
  if (!session.enabled) throw new ForbiddenError("Radio is disabled");

  const id = randomUUID();
  await db.radioEmote.create({
    data: {
      id,
      tenantId: radioTenantKey(normalizedTenantId, station),
      userId: actor.id,
      emote: input.emote,
      x: input.x ?? null,
      y: input.y ?? null,
    },
  });
  const emote = {
    id,
    user: { id: actor.id, slug: actor.slug, name: actor.name },
    emote: input.emote,
    x: input.x ?? null,
    y: input.y ?? null,
    createdAt: new Date().toISOString(),
  };
  broadcastRadioEvent(radioTenantKey(normalizedTenantId, station), { type: "emote", payload: emote });
  return emote;
}

export async function advanceRadioIfNeeded(
  tenantId?: string | null,
  force = false,
  station: RadioStation = "all",
) {
  const normalizedTenantId = resolvedTenantId(tenantId);
  const sessionTenantId = radioTenantKey(normalizedTenantId, station);
  const session = await ensureRadioSession(normalizedTenantId, station);
  const startedAtMs = session.startedAt?.getTime() ?? 0;
  if (!force && Date.now() < startedAtMs + session.durationSeconds * 1000) {
    return false;
  }

  const options = parseJsonArray(session.voteOptions);
  const votes = await countVotes(sessionTenantId, session.voteRound);
  const winnerId =
    [...options].sort((a, b) => (votes.get(b) ?? 0) - (votes.get(a) ?? 0))[0] ??
    options[0] ??
    null;
  const history = [winnerId, ...parseJsonArray(session.history)].filter(
    (id): id is number => typeof id === "number" && Number.isFinite(id),
  ).slice(0, HISTORY_LIMIT);
  const eligible = await getEligibleTracks(normalizedTenantId, history, station);
  const newOptions = pickRandomTracks(eligible, VOTE_OPTION_COUNT).map((track) => track.id);

  await saveSession({
    tenantId: sessionTenantId,
    currentTrackId: winnerId,
    startedAt: new Date(),
    durationSeconds: DEFAULT_TRACK_DURATION_SECONDS,
    voteRound: randomUUID(),
    voteOptions: newOptions,
    history,
  });
  await db.radioEmote.deleteMany({
    where: {
      tenantId: sessionTenantId,
      createdAt: { lt: new Date(Date.now() - 5 * 60_000) },
    },
  });
  const state = await getRadioState({ tenantId: normalizedTenantId, station });
  broadcastRadioEvent(sessionTenantId, { type: "track.changed", payload: state });
  return true;
}

export async function manageRadio({
  tenantId,
  actor,
  input,
}: {
  tenantId?: string | null;
  actor?: RadioActor | null;
  input: z.infer<typeof radioAdminActionSchema>;
}) {
  const normalizedTenantId = resolvedTenantId(tenantId);
  if (input.action === "set-enabled") {
    await ensureRadioSession(normalizedTenantId);
    await saveSession({ tenantId: normalizedTenantId, enabled: input.enabled });
    const state = await getRadioState({ tenantId: normalizedTenantId });
    broadcastRadioEvent(normalizedTenantId, { type: "state", payload: state });
    return state;
  }
  if (input.action === "ban-track") {
    await db.radioBan.upsert({
      where: { tenantId_trackId: { tenantId: normalizedTenantId, trackId: input.trackId } },
      create: {
        id: randomUUID(),
        tenantId: normalizedTenantId,
        trackId: input.trackId,
        reason: input.reason ?? null,
        createdBy: actor?.id ?? null,
      },
      update: { reason: input.reason ?? null },
    });
  }
  await advanceRadioIfNeeded(normalizedTenantId, true);
  return getRadioState({ tenantId: normalizedTenantId, actor });
}

export async function startRadioRuntime() {
  const interval = setInterval(() => {
    void advanceRadioIfNeeded(undefined, false, "all").catch(() => undefined);
    void advanceRadioIfNeeded(undefined, false, "safe").catch(() => undefined);
  }, 5_000);
  return {
    name: "radio",
    stop() {
      clearInterval(interval);
    },
  };
}
