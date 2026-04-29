import { createHmac } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { appConfig } from "../config/app.js";
import { enqueueJob } from "./jobQueue.js";
import logger from "./logger.js";
import {
  createWebhookSubscriptionInDb,
  deleteWebhookSubscriptionInDb,
  listWebhookSubscriptionsFromDb,
  listWebhookSubscriptionsFromDbForTenant,
  loadActiveWebhookDestinations,
  markWebhookSubscriptionDelivery,
  updateWebhookSubscriptionInDb,
} from "./platformStore.js";

type DomainEvent = {
  eventId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  tenantId?: string;
  type: string;
};

function signPayload(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function appendWebhookLog(entry: Record<string, unknown>) {
  const outputPath = path.resolve(process.cwd(), appConfig.platform.webhookLogPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.appendFile(outputPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function loadRecentWebhookDeliveries(limit = 50) {
  const outputPath = path.resolve(process.cwd(), appConfig.platform.webhookLogPath);
  try {
    const raw = await fs.readFile(outputPath, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .reverse();
  } catch {
    return [];
  }
}

export function enqueueWebhookDeliveries(event: DomainEvent) {
  if (!appConfig.platform.webhooks.enabled) {
    return;
  }

  void (async () => {
    const destinations = await listResolvedWebhookDestinations(event.type);
    await Promise.all(
      destinations.map((endpoint) =>
        enqueueJob({
          type: "webhook.delivery",
          payload: {
            endpointId: endpoint.id,
            event,
          },
        }),
      ),
    );
  })();
}

export async function deliverWebhookJob(payload: Record<string, unknown>) {
  const endpointId = String(payload.endpointId ?? "");
  const event = payload.event as DomainEvent | undefined;
  const configEndpoint = appConfig.platform.webhooks.endpoints.find(
    (candidate) => candidate.id === endpointId,
  );
  const subscription =
    (await listWebhookSubscriptionsFromDb()).find((candidate) => candidate.id === endpointId) ??
    null;
  const endpoint =
    configEndpoint ??
    (subscription
      ? {
          id: subscription.id,
          url: subscription.endpoint,
          events: subscription.events,
          secret: subscription.secret ?? undefined,
          headers: (subscription.headers ?? undefined) as Record<string, string> | undefined,
        }
      : null);
  if (!event || !endpoint) {
    throw new Error("Webhook delivery payload missing endpoint or event");
  }

  const requestPayload = JSON.stringify(event);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Jamcore-Event": event.type,
    "X-Jamcore-Event-Id": event.eventId,
    ...(endpoint.headers ?? {}),
  };

  if (endpoint.secret) {
    headers["X-Jamcore-Signature"] = signPayload(endpoint.secret, requestPayload);
  }

  const startedAt = Date.now();
  let status = 0;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: requestPayload,
      signal: AbortSignal.timeout(appConfig.platform.webhooks.timeoutMs),
    });
    status = response.status;
    if (!response.ok) {
      errorMessage = await response.text();
      throw new Error(errorMessage || `Webhook delivery failed with ${status}`);
    }

    await appendWebhookLog({
      deliveryId: `${event.eventId}:${endpoint.id}`,
      durationMs: Date.now() - startedAt,
      endpointId: endpoint.id,
      errorMessage: null,
      eventId: event.eventId,
      eventType: event.type,
      ok: true,
      status,
      timestamp: new Date().toISOString(),
    });
    if (subscription) {
      await markWebhookSubscriptionDelivery({ id: subscription.id, ok: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendWebhookLog({
      deliveryId: `${event.eventId}:${endpoint.id}`,
      durationMs: Date.now() - startedAt,
      endpointId: endpoint.id,
      errorMessage: message,
      eventId: event.eventId,
      eventType: event.type,
      ok: false,
      status,
      timestamp: new Date().toISOString(),
    });
    logger.warn("Webhook delivery failed", {
      endpointId: endpoint.id,
      eventId: event.eventId,
      eventType: event.type,
      status,
      errorMessage: message,
    });
    if (subscription) {
      await markWebhookSubscriptionDelivery({ id: subscription.id, ok: false });
    }
    throw error;
  }
}

export async function listWebhookSubscriptions() {
  return listWebhookSubscriptionsFromDbForTenant();
}

export async function listWebhookSubscriptionsForTenant(tenantId?: string | null) {
  return listWebhookSubscriptionsFromDbForTenant(tenantId);
}

export async function createWebhookSubscription(input: {
  endpoint: string;
  events: string[];
  secret?: string;
  headers?: Record<string, string>;
  tenantId?: string;
}) {
  const id = randomUUID();
  await createWebhookSubscriptionInDb({
    id,
    ...input,
  });
  return { id };
}

export async function updateWebhookSubscription(input: {
  id: string;
  endpoint?: string;
  events?: string[];
  secret?: string | null;
  headers?: Record<string, string> | null;
  status?: "active" | "paused";
  tenantId?: string | null;
}) {
  await updateWebhookSubscriptionInDb(input);
}

export async function deleteWebhookSubscription(id: string, tenantId?: string | null) {
  await deleteWebhookSubscriptionInDb(id, tenantId);
}

export async function listResolvedWebhookDestinations(eventType: string) {
  const configDestinations = appConfig.platform.webhooks.endpoints
    .filter((endpoint) => endpoint.events.includes(eventType) || endpoint.events.includes("*"))
    .map((endpoint) => ({
      id: endpoint.id,
    }));
  const dbDestinations = await loadActiveWebhookDestinations(eventType);
  return [...configDestinations, ...dbDestinations.map((endpoint) => ({ id: endpoint.id }))];
}
