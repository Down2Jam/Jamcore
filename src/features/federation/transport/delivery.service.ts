import { createFederationDeliveryWorker } from "./delivery.worker.js";
import { isFederationInboxBlocked } from "../admin.service.js";

const deliveryWorker = createFederationDeliveryWorker();

export async function enqueueFederationDelivery({
  inbox,
  activity,
  tenantId,
}: {
  inbox: string | null | undefined;
  activity: unknown;
  tenantId?: string | null;
}) {
  if (inbox && await isFederationInboxBlocked(inbox, tenantId)) {
    return null;
  }
  return deliveryWorker.enqueue({
    inbox,
    activity,
  });
}

export function getFederationDeliveryRecord(id: string) {
  return deliveryWorker.getRecord(id);
}

export function listFederationDeliveryRecords(limit = 50) {
  return deliveryWorker.listRecords(limit);
}

export async function resumePendingFederationDeliveries() {
  await deliveryWorker.resumePending();
}

export async function resetFederationDeliveryState() {
  await deliveryWorker.reset();
}
