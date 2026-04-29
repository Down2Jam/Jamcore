import fs from "node:fs/promises";
import path from "node:path";

import { appConfig } from "../../../config/app.js";
import type { FederationStateRepository } from "./repository.js";
import { federationStateSchema, type FederationState } from "./types.js";

function getStatePath() {
  return path.resolve(process.cwd(), appConfig.federation.state.path);
}

export function createFileFederationStateRepository(): FederationStateRepository {
  let loadedState: FederationState | null = null;
  let writeQueue = Promise.resolve();

  async function loadState() {
    if (!appConfig.federation.state.enabled && loadedState) {
      return loadedState;
    }

    if (!appConfig.federation.state.enabled) {
      loadedState = {
        deliveries: [],
        remoteActors: [],
        followers: [],
        following: [],
      };
      return loadedState;
    }

    if (loadedState) {
      return loadedState;
    }

    const filePath = getStatePath();

    try {
      const raw = await fs.readFile(filePath, "utf8");
      loadedState = federationStateSchema.parse(JSON.parse(raw));
    } catch {
      loadedState = {
        deliveries: [],
        remoteActors: [],
        followers: [],
        following: [],
      };
    }

    return loadedState;
  }

  async function flushState() {
    if (!appConfig.federation.state.enabled || !loadedState) {
      return;
    }

    const filePath = getStatePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(loadedState, null, 2), "utf8");
  }

  async function saveState(state: FederationState) {
    loadedState = state;
    writeQueue = writeQueue.then(() => flushState()).catch((error) => {
      console.error("Failed to persist federation state", error);
    });
    await writeQueue;
  }

  return {
    loadState,
    saveState,
  };
}
