import { Prisma } from "@prisma/client";
import db from "../../infra/db.js";
import logger from "../../infra/logger.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { extractMusicFilenameFromUrl, getMusicFileBuffer } from "../tracks/audio-download.js";
import { analyzeAudio } from "./audio-analysis.js";

export async function enqueueAudioAnalysis(source: string) {
  const sourceKey = extractMusicFilenameFromUrl(source);
  if (!sourceKey) return;
  await db.trackAudioAnalysis.upsert({ where: { sourceKey }, create: { sourceKey }, update: {} });
}

export async function readAudioAnalysis(source: string, tenantId?: string | null) {
  const sourceKey = extractMusicFilenameFromUrl(source);
  if (!sourceKey) return null;
  const tracks = await db.gamePageTrack.findMany({
    where: { OR: [{ url: { endsWith: `/${sourceKey}` } }, { url: source }], gamePage: { game: { published: true } } },
    select: { gamePage: { select: { gameId: true } } },
  });
  const allowed = await filterCoreEntityIdsByTenant({ entityType: "Game", ids: tracks.map(track => track.gamePage.gameId), tenantId });
  if (!allowed.length) return null;
  const record = await db.trackAudioAnalysis.findUnique({ where: { sourceKey } });
  if (!record || record.status !== "ready" || record.version !== 1) return null;
  return { version: record.version, duration: record.duration, waveform: record.waveform, rhythm: record.rhythm,
    integratedLufs: record.integratedLufs, truePeakDb: record.truePeakDb, loudnessGainDb: record.loudnessGainDb };
}

async function discoverAudio() {
  await db.$executeRaw`
    INSERT INTO "TrackAudioAnalysis" ("sourceKey", "updatedAt")
    SELECT DISTINCT regexp_replace(split_part(split_part("url", '?', 1), '#', 1), '^.*/', ''), NOW()
    FROM "GamePageTrack"
    WHERE regexp_replace(split_part(split_part("url", '?', 1), '#', 1), '^.*/', '') ~* '^[A-Za-z0-9._-]+\\.(mp3|ogg|wav)$'
    ON CONFLICT DO NOTHING`;
  // A track may be saved after its upload has already finished analysis.
  await db.$executeRaw`
    UPDATE "GamePageTrack" t SET "integratedLufs" = a."integratedLufs", "truePeakDb" = a."truePeakDb", "loudnessGainDb" = a."loudnessGainDb"
    FROM "TrackAudioAnalysis" a
    WHERE a.status = 'ready' AND a."loudnessGainDb" IS NOT NULL
      AND a."sourceKey" = regexp_replace(split_part(split_part(t.url, '?', 1), '#', 1), '^.*/', '')
      AND (t."integratedLufs" IS DISTINCT FROM a."integratedLufs" OR t."truePeakDb" IS DISTINCT FROM a."truePeakDb" OR t."loudnessGainDb" IS DISTINCT FROM a."loudnessGainDb")`;
}

export async function backfillAudioAnalysis(signal?: AbortSignal) {
  await discoverAudio();
  let completed = 0;
  while (!signal?.aborted) {
    const jobs = await db.$queryRaw<Array<{ sourceKey: string; attempts: number }>>`
      UPDATE "TrackAudioAnalysis" SET status = 'processing', "lockedAt" = NOW(), attempts = attempts + 1, "updatedAt" = NOW()
      WHERE "sourceKey" = (
        SELECT "sourceKey" FROM "TrackAudioAnalysis"
        WHERE (status IN ('pending', 'failed') AND "retryAt" <= NOW())
           OR (status = 'processing' AND "lockedAt" < NOW() - INTERVAL '10 minutes')
        ORDER BY "retryAt", "sourceKey" FOR UPDATE SKIP LOCKED LIMIT 1
      ) RETURNING "sourceKey", attempts`;
    const job = jobs[0];
    if (!job) break;
    try {
      const buffer = await getMusicFileBuffer(job.sourceKey);
      if (!buffer || buffer.length > 128 * 1024 * 1024) throw new Error("Audio file unavailable or exceeds size limit");
      if (signal?.aborted) throw new Error("Audio analysis stopped");
      const result = await analyzeAudio(buffer, signal);
      await db.trackAudioAnalysis.update({ where: { sourceKey: job.sourceKey }, data: {
        ...result, rhythm: result.rhythm ?? Prisma.DbNull, status: "ready", version: 1, error: null, lockedAt: null,
      } });
      completed++;
    } catch (error) {
      await db.trackAudioAnalysis.update({ where: { sourceKey: job.sourceKey }, data: {
        status: "failed", lockedAt: null, error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        retryAt: new Date(Date.now() + Math.min(86400, 60 * 2 ** Math.min(job.attempts, 10)) * 1000),
      } });
      logger.warn("Audio analysis deferred", { sourceKey: job.sourceKey, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await discoverAudio();
  if (completed) logger.info("Audio analysis backfill completed", { completed });
  return completed;
}

export function startAudioAnalysisRuntime() {
  const controller = new AbortController();
  let running: Promise<unknown> | null = null;
  const tick = () => {
    if (running || controller.signal.aborted) return;
    running = backfillAudioAnalysis(controller.signal).catch(error => logger.warn("Audio analysis backfill failed", { error: String(error) })).finally(() => { running = null; });
  };
  tick();
  const timer = setInterval(tick, 60_000);
  timer.unref();
  return { name: "audio-analysis", stop: async () => { clearInterval(timer); controller.abort(); await running; } };
}
