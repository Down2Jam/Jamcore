import {
  startFederationRuntime,
} from "../features/federation/index.js";
import { startScheduledPostPublisherRuntime } from "../features/posts/publisher.runtime.js";
import { startRadioRuntime } from "../features/radio/index.js";
import { startStreamersRuntime } from "../features/streamers/index.js";
import { startPlatformRuntime } from "../jobs/platform.js";

export type RuntimeModuleHandle = {
  name: string;
  stop?: () => void | Promise<void>;
};

export type RuntimeModules = {
  handles: RuntimeModuleHandle[];
};

export async function startRuntimeModules(): Promise<RuntimeModules> {
  const handles = await Promise.all([
    startFederationRuntime(),
    Promise.resolve(startPlatformRuntime()),
    Promise.resolve(startScheduledPostPublisherRuntime()),
    startRadioRuntime(),
    startStreamersRuntime(),
  ]);

  return {
    handles,
  };
}

export async function stopRuntimeModules(runtimeModules: RuntimeModules) {
  for (const handle of [...runtimeModules.handles].reverse()) {
    await handle.stop?.();
  }
}
