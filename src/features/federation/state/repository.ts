import type {
  FederationState,
  PersistedDeliveryState,
  PersistedFollowerState,
  PersistedFollowingState,
  PersistedRemoteActorState,
} from "./types.js";
import { appConfig } from "../../../config/app.js";
import { createFileFederationStateRepository } from "./file.repository.js";

export type FederationStateRepository = {
  loadState(): Promise<FederationState>;
  saveState(state: FederationState): Promise<void>;
};

let repository: FederationStateRepository | null = null;

export function getFederationStateRepository(): FederationStateRepository {
  if (repository) {
    return repository;
  }

  switch (appConfig.federation.state.provider) {
    case "file":
    default:
      repository = createFileFederationStateRepository();
      return repository;
  }
}

export type {
  PersistedDeliveryState,
  PersistedFollowerState,
  PersistedFollowingState,
  PersistedRemoteActorState,
};
