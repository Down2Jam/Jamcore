import {
  claimIdempotencyRecordInDb,
  completeIdempotencyRecordInDb,
  deleteIdempotencyRecordInDb,
  getIdempotencyRecordFromDb,
  upsertIdempotencyRecordInDb,
} from "./platformStore.js";

export type IdempotencyRecord = {
  key: string;
  requestHash: string;
  status: "in_progress" | "completed";
  responseBody?: unknown;
  responseKind?: "json" | "text" | "empty";
  responseStatus?: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type IdempotencyClaimResult =
  | { state: "claimed" }
  | { state: "hash_mismatch"; record: IdempotencyRecord }
  | { state: "in_progress"; record: IdempotencyRecord }
  | { state: "replay"; record: IdempotencyRecord };

export async function getIdempotencyRecord(key: string) {
  const record = await getIdempotencyRecordFromDb(key);
  if (!record) {
    return null;
  }

  return {
    key: record.idempotencyKey,
    requestHash: record.requestHash,
    status: record.status as IdempotencyRecord["status"],
    responseBody: record.responseBody,
    responseKind: (record.responseKind ?? undefined) as IdempotencyRecord["responseKind"],
    responseStatus: record.responseStatus ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  } satisfies IdempotencyRecord;
}

export async function claimIdempotencyRecord(input: {
  key: string;
  requestHash: string;
  expiresAt: string;
}): Promise<IdempotencyClaimResult> {
  const result = await claimIdempotencyRecordInDb({
    key: input.key,
    requestHash: input.requestHash,
    expiresAt: new Date(input.expiresAt),
  });

  if (result.state === "claimed") {
    return result;
  }

  return {
    state: result.state,
    record: {
      key: result.record.idempotencyKey,
      requestHash: result.record.requestHash,
      status: result.record.status as IdempotencyRecord["status"],
      responseBody: result.record.responseBody,
      responseKind: (result.record.responseKind ?? undefined) as IdempotencyRecord["responseKind"],
      responseStatus: result.record.responseStatus ?? undefined,
      createdAt: result.record.createdAt.toISOString(),
      updatedAt: result.record.updatedAt.toISOString(),
      expiresAt: result.record.expiresAt.toISOString(),
    },
  } satisfies IdempotencyClaimResult;
}

export async function upsertIdempotencyRecord(record: IdempotencyRecord) {
  await upsertIdempotencyRecordInDb({
    key: record.key,
    requestHash: record.requestHash,
    status: record.status,
    responseBody: record.responseBody,
    responseKind: record.responseKind,
    responseStatus: record.responseStatus,
    expiresAt: new Date(record.expiresAt),
  });
}

export async function completeIdempotencyRecord(input: {
  key: string;
  requestHash: string;
  responseBody?: unknown;
  responseKind?: "json" | "text" | "empty";
  responseStatus?: number;
}) {
  await completeIdempotencyRecordInDb({
    key: input.key,
    requestHash: input.requestHash,
    responseBody: input.responseBody,
    responseKind: input.responseKind,
    responseStatus: input.responseStatus,
  });
}

export async function deleteIdempotencyRecord(key: string) {
  await deleteIdempotencyRecordInDb(key);
}
