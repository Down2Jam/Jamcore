import { randomUUID } from "node:crypto";
import path from "node:path";

import { appConfig } from "../config/app.js";
import { appendJsonLine } from "./fileStore.js";
import logger from "./logger.js";
import { recordJobExecution } from "./metrics.js";
import {
  claimDueJobsFromDb,
  completeJobInDb,
  enqueueJobInDb,
  failJobInDb,
  listJobsFromDb,
} from "./platformStore.js";

export type JobRecord = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "dead";
  attempts: number;
  runAt: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

type JobHandler = (job: JobRecord) => Promise<void>;

function deadLetter(job: JobRecord) {
  appendJsonLine(path.resolve(process.cwd(), appConfig.platform.deadLetterLogPath), job);
}

export async function listJobs(limit = 100) {
  const rows = await listJobsFromDb(limit);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload,
    status: row.status as JobRecord["status"],
    attempts: row.attempts,
    runAt: row.runAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastError: row.lastError ?? undefined,
  }));
}

export async function enqueueJob(input: {
  type: string;
  payload: Record<string, unknown>;
  runAt?: Date;
}) {
  const now = new Date();
  const job: JobRecord = {
    id: randomUUID(),
    type: input.type,
    payload: input.payload,
    status: "pending",
    attempts: 0,
    runAt: (input.runAt ?? now).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await enqueueJobInDb({
    id: job.id,
    type: job.type,
    payload: job.payload,
    runAt: new Date(job.runAt),
  });

  return job;
}

export function startJobWorker(handlers: Record<string, JobHandler>) {
  const interval = setInterval(async () => {
    const jobs = await claimDueJobsFromDb(10);

    for (const job of jobs) {
      const normalizedJob: JobRecord = {
        id: job.id,
        type: job.type,
        payload: job.payload,
        status: job.status as JobRecord["status"],
        attempts: job.attempts,
        runAt: job.runAt.toISOString(),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        lastError: job.lastError ?? undefined,
      };

      const handler = handlers[job.type];
      if (!handler) {
        await failJobInDb({
          jobId: job.id,
          attempts: job.attempts + 1,
          lastError: `Missing job handler for ${job.type}`,
          dead: true,
        });
        deadLetter({
          ...normalizedJob,
          status: "dead",
          attempts: job.attempts + 1,
          lastError: `Missing job handler for ${job.type}`,
        });
        continue;
      }

      const startedAt = Date.now();
      try {
        await handler(normalizedJob);
        await completeJobInDb(job.id);
        recordJobExecution({
          jobType: job.type,
          success: true,
          deadLettered: false,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const nextAttempts = job.attempts + 1;
        const retryDelayMs =
          appConfig.platform.jobs.retryDelaysMs[job.attempts] ??
          appConfig.platform.jobs.retryDelaysMs.at(-1) ??
          0;
        const dead = nextAttempts > appConfig.platform.jobs.retryDelaysMs.length;

        await failJobInDb({
          jobId: job.id,
          attempts: nextAttempts,
          lastError: message,
          retryAt: dead ? undefined : new Date(Date.now() + retryDelayMs),
          dead,
        });

        if (dead) {
          deadLetter({
            ...normalizedJob,
            status: "dead",
            attempts: nextAttempts,
            lastError: message,
          });
        }

        recordJobExecution({
          jobType: job.type,
          success: false,
          deadLettered: dead,
          durationMs: Date.now() - startedAt,
        });

        logger.warn("Background job failed", {
          jobId: job.id,
          type: job.type,
          attempts: nextAttempts,
          message,
        });
      }
    }
  }, appConfig.platform.jobs.pollIntervalMs);

  interval.unref?.();

  return {
    name: "job-worker",
    stop: () => clearInterval(interval),
  };
}
