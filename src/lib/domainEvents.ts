import { randomUUID } from "node:crypto";

import {
  listDomainEventsFromDb,
  persistDomainEventInDb,
} from "../infra/platformStore.js";
import { enqueueWebhookDeliveries } from "../infra/webhooks.js";
import logger from "../infra/logger.js";

type DomainEvent = {
  eventId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  tenantId?: string;
  type: string;
};

type DomainEventListener = (event: DomainEvent) => void | Promise<void>;

const listeners = new Set<DomainEventListener>();
const recentEvents: DomainEvent[] = [];

export function registerDomainEventListener(listener: DomainEventListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listRecentDomainEvents(limit = 50) {
  return recentEvents.slice(-limit).reverse();
}

export async function listPersistedDomainEvents(input?: {
  after?: string;
  limit?: number;
  tenantId?: string | null;
}) {
  return listDomainEventsFromDb(input);
}

export async function emitDomainEvent({
  payload,
  tenantId,
  type,
}: {
  payload: Record<string, unknown>;
  tenantId?: string;
  type: string;
}) {
  const event: DomainEvent = {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    payload,
    tenantId,
    type,
  };

  logger.info("Domain event emitted", {
    eventId: event.eventId,
    tenantId,
    type,
  });
  await persistDomainEventInDb(event);
  recentEvents.push(event);
  if (recentEvents.length > 100) {
    recentEvents.shift();
  }

  await Promise.all([...listeners].map((listener) => Promise.resolve(listener(event))));
  enqueueWebhookDeliveries(event);
}
