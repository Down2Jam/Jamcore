import { appConfig } from "../../../config/app.js";
import { getFederationStateRepository } from "./repository.js";
import type {
  FederationState,
  PersistedDeliveryState,
  PersistedFollowerState,
  PersistedFollowingState,
  PersistedRemoteActorState,
} from "./types.js";

export type {
  PersistedDeliveryState,
  PersistedFollowerState,
  PersistedFollowingState,
  PersistedRemoteActorState,
};

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(entries: T[]) {
  return [...entries].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

async function readState() {
  return getFederationStateRepository().loadState();
}

async function writeState(state: FederationState) {
  await getFederationStateRepository().saveState(state);
}

export async function upsertPersistedDelivery(record: PersistedDeliveryState) {
  const state = await readState();
  const existingIndex = state.deliveries.findIndex((entry) => entry.id === record.id);
  if (existingIndex >= 0) {
    state.deliveries[existingIndex] = record;
  } else {
    state.deliveries.unshift(record);
  }

  state.deliveries = sortByUpdatedAtDesc(state.deliveries).slice(
    0,
    appConfig.federation.state.maxDeliveries,
  );

  await writeState(state);
}

export async function listPersistedDeliveries() {
  const state = await readState();
  return [...state.deliveries];
}

export async function getPersistedDelivery(id: string) {
  const state = await readState();
  return state.deliveries.find((entry) => entry.id === id) ?? null;
}

export async function listQueuedPersistedDeliveries() {
  const state = await readState();
  return state.deliveries.filter((entry) => entry.status === "queued");
}

export async function upsertPersistedRemoteActor(entry: PersistedRemoteActorState) {
  const state = await readState();
  const existingIndex = state.remoteActors.findIndex(
    (item) => item.actorId === entry.actorId,
  );
  if (existingIndex >= 0) {
    state.remoteActors[existingIndex] = entry;
  } else {
    state.remoteActors.unshift(entry);
  }

  state.remoteActors = [...state.remoteActors]
    .sort((a, b) => b.expiresAt - a.expiresAt)
    .slice(0, appConfig.federation.state.maxRemoteActors);

  await writeState(state);
}

export async function getPersistedRemoteActor(actorId: string) {
  const state = await readState();
  return state.remoteActors.find((entry) => entry.actorId === actorId) ?? null;
}

export async function clearFederationState() {
  await writeState({
    deliveries: [],
    remoteActors: [],
    followers: [],
    following: [],
  });
}

export async function upsertPersistedFollower(entry: PersistedFollowerState) {
  const state = await readState();
  const existingIndex = state.followers.findIndex(
    (item) => item.id === entry.id,
  );
  if (existingIndex >= 0) {
    state.followers[existingIndex] = entry;
  } else {
    state.followers.unshift(entry);
  }

  state.followers = sortByUpdatedAtDesc(state.followers).slice(
    0,
    appConfig.federation.state.maxRemoteActors,
  );

  await writeState(state);
}

export async function listPersistedFollowersByTargetActorId(targetActorId: string) {
  const state = await readState();
  return state.followers.filter(
    (entry) => entry.targetActorId === targetActorId && entry.status === "active",
  );
}

export async function getPersistedFollower(id: string) {
  const state = await readState();
  return state.followers.find((entry) => entry.id === id) ?? null;
}

export async function upsertPersistedFollowing(entry: PersistedFollowingState) {
  const state = await readState();
  const existingIndex = state.following.findIndex(
    (item) => item.id === entry.id,
  );
  if (existingIndex >= 0) {
    state.following[existingIndex] = entry;
  } else {
    state.following.unshift(entry);
  }

  state.following = sortByUpdatedAtDesc(state.following).slice(
    0,
    appConfig.federation.state.maxRemoteActors,
  );

  await writeState(state);
}

export async function listPersistedFollowingByActorId(actorId: string) {
  const state = await readState();
  return state.following.filter(
    (entry) => entry.actorId === actorId && entry.status === "active",
  );
}

export async function getPersistedFollowing(id: string) {
  const state = await readState();
  return state.following.find((entry) => entry.id === id) ?? null;
}
