import axios from "axios";

import { appConfig } from "../../../config/app.js";
import {
  clearFederationState,
  listPersistedDeliveries,
  listQueuedPersistedDeliveries,
  type PersistedDeliveryState,
  upsertPersistedDelivery,
} from "../state/state.service.js";
import { createSignedRequestHeaders } from "./http-signature.service.js";

type DeliveryJob = {
  id: string;
  inbox: string;
  activity: unknown;
  attempt: number;
};

export type DeliveryRecord = {
  id: string;
  inbox: string;
  activity: unknown;
  attempts: number;
  status: "queued" | "delivered" | "failed";
  lastError: string | null;
  activityType: string | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
};

function toPersistedRecord(record: DeliveryRecord): PersistedDeliveryState {
  return {
    id: record.id,
    inbox: record.inbox,
    activity: record.activity,
    attempts: record.attempts,
    status: record.status,
    lastError: record.lastError,
    activityType: record.activityType,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    nextAttemptAt: record.nextAttemptAt,
  };
}

function hydrateRecord(record: PersistedDeliveryState): DeliveryRecord {
  return {
    ...record,
  };
}

function getRetryDelay(attempt: number) {
  return (
    appConfig.federation.delivery.retryDelaysMs[attempt - 1] ??
    appConfig.federation.delivery.retryDelaysMs.at(-1) ??
    0
  );
}

async function sendActivity(inbox: string, activity: unknown) {
  const body = JSON.stringify(activity);
  const actorId =
    activity &&
    typeof activity === "object" &&
    "actor" in activity &&
    typeof activity.actor === "string"
      ? activity.actor
      : null;

  const signedHeaders =
    appConfig.federation.security.enabled && actorId
      ? createSignedRequestHeaders({
          actorId,
          inbox,
          body,
        })
      : {};

  await axios.post(inbox, activity, {
    headers: {
      "Content-Type": "application/activity+json",
      Accept:
        'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
      "User-Agent": appConfig.federation.delivery.userAgent,
      ...signedHeaders,
    },
    timeout: appConfig.federation.delivery.timeoutMs,
  });
}

function getActivityType(activity: unknown) {
  if (
    activity &&
    typeof activity === "object" &&
    "type" in activity &&
    typeof activity.type === "string"
  ) {
    return activity.type;
  }

  return null;
}

export function createFederationDeliveryWorker() {
  const deliveryRecords = new Map<string, DeliveryRecord>();
  const pendingJobs: DeliveryJob[] = [];
  let processing = false;
  let nextJobId = 1;
  let initializationPromise: Promise<void> | null = null;

  async function scheduleRetry(job: DeliveryJob) {
    const delay = getRetryDelay(job.attempt);
    const record = deliveryRecords.get(job.id);
    if (record) {
      const nextAttemptAt = new Date(Date.now() + delay).toISOString();
      const updatedRecord = {
        ...record,
        nextAttemptAt,
        updatedAt: new Date().toISOString(),
      };
      deliveryRecords.set(job.id, updatedRecord);
      await upsertPersistedDelivery(toPersistedRecord(updatedRecord));
    }

    setTimeout(() => {
      pendingJobs.push(job);
      void processQueue();
    }, delay);
  }

  async function processQueue() {
    if (processing) {
      return;
    }

    processing = true;
    try {
      while (pendingJobs.length > 0) {
        const job = pendingJobs.shift();
        if (!job) {
          continue;
        }

        const record = deliveryRecords.get(job.id);
        if (!record) {
          continue;
        }

        try {
          await sendActivity(job.inbox, job.activity);
          const updatedRecord = {
            ...record,
            attempts: job.attempt,
            status: "delivered" as const,
            lastError: null,
            updatedAt: new Date().toISOString(),
            nextAttemptAt: null,
          };
          deliveryRecords.set(job.id, updatedRecord);
          await upsertPersistedDelivery(toPersistedRecord(updatedRecord));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown delivery error";
          const nextAttempt = job.attempt + 1;
          const hasRetryBudget =
            nextAttempt <= appConfig.federation.delivery.retryDelaysMs.length + 1;

          const updatedRecord = {
            ...record,
            attempts: job.attempt,
            status: hasRetryBudget ? "queued" as const : "failed" as const,
            lastError: message,
            updatedAt: new Date().toISOString(),
            nextAttemptAt: hasRetryBudget
              ? new Date(Date.now() + getRetryDelay(nextAttempt)).toISOString()
              : null,
          };
          deliveryRecords.set(job.id, updatedRecord);
          await upsertPersistedDelivery(toPersistedRecord(updatedRecord));

          if (hasRetryBudget) {
            await scheduleRetry({
              ...job,
              attempt: nextAttempt,
            });
          }
        }
      }
    } finally {
      processing = false;
    }
  }

  async function initializeState() {
    const persisted = await listPersistedDeliveries();
    deliveryRecords.clear();
    for (const record of persisted) {
      deliveryRecords.set(record.id, hydrateRecord(record));
    }

    const deliveryIds = persisted
      .map((record) => {
        const match = record.id.match(/^delivery-(\d+)$/);
        return match ? Number(match[1]) : 0;
      })
      .filter((value) => Number.isFinite(value));

    nextJobId = (Math.max(0, ...deliveryIds) || 0) + 1;
  }

  async function ensureInitialized() {
    if (!initializationPromise) {
      initializationPromise = initializeState();
    }

    await initializationPromise;
  }

  return {
    async enqueue({
      inbox,
      activity,
    }: {
      inbox: string | null | undefined;
      activity: unknown;
    }) {
      await ensureInitialized();

      if (!appConfig.federation.enabled || !appConfig.federation.delivery.enabled || !inbox) {
        return null;
      }

      const id = `delivery-${nextJobId++}`;
      const record: DeliveryRecord = {
        id,
        inbox,
        activity,
        attempts: 0,
        status: "queued",
        lastError: null,
        activityType: getActivityType(activity),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nextAttemptAt: null,
      };
      deliveryRecords.set(id, record);
      await upsertPersistedDelivery(toPersistedRecord(record));
      pendingJobs.push({
        id,
        inbox,
        activity,
        attempt: 1,
      });

      void processQueue();

      return id;
    },

    getRecord(id: string) {
      return deliveryRecords.get(id) ?? null;
    },

    listRecords(limit = 50) {
      return [...deliveryRecords.values()]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, limit);
    },

    async resumePending() {
      if (!appConfig.federation.enabled || !appConfig.federation.delivery.enabled) {
        return;
      }

      await ensureInitialized();
      const queuedRecords = await listQueuedPersistedDeliveries();

      queuedRecords.forEach((record) => {
        const job: DeliveryJob = {
          id: record.id,
          inbox: record.inbox,
          activity: record.activity,
          attempt: Math.max(1, record.attempts + 1),
        };

        if (record.nextAttemptAt) {
          const delay = Math.max(
            0,
            new Date(record.nextAttemptAt).getTime() - Date.now(),
          );
          setTimeout(() => {
            pendingJobs.push(job);
            void processQueue();
          }, delay);
          return;
        }

        pendingJobs.push(job);
      });

      if (queuedRecords.length > 0) {
        void processQueue();
      }
    },

    async reset() {
      deliveryRecords.clear();
      pendingJobs.splice(0, pendingJobs.length);
      processing = false;
      nextJobId = 1;
      initializationPromise = null;
      await clearFederationState();
    },
  };
}
