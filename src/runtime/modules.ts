import {
  startFederationRuntime,
} from "../features/federation/index.js";
import { startScheduledPostPublisherRuntime } from "../features/posts/publisher.runtime.js";
import { startRadioRuntime } from "../features/radio/index.js";
import { startStreamersRuntime } from "../features/streamers/index.js";
import { startPlatformRuntime } from "../jobs/platform.js";
import { startDeviceAuthCleanupJob } from "../auth/deviceAuthCleanupJob.js";
import { startTokenCleanupJob } from "../auth/tokenCleanupJob.js";
import { startWebBuildCleanupRuntime } from "../features/games/web-build.runtime.js";

export type RuntimeModuleHandle = {
  name: string;
  stop?: () => void | Promise<void>;
};

export type RuntimeModules = {
  handles: RuntimeModuleHandle[];
};

export async function startRuntimeModules(): Promise<RuntimeModules> {
  const deviceAuthCleanupTask = startDeviceAuthCleanupJob();
  const tokenCleanupTask = startTokenCleanupJob();

  const handles = await Promise.all([
    Promise.resolve({ name: "token-cleanup", stop: () => tokenCleanupTask.stop() }),
    startFederationRuntime(),
    Promise.resolve(startPlatformRuntime()),
    Promise.resolve(startScheduledPostPublisherRuntime()),
    Promise.resolve(startWebBuildCleanupRuntime()),
    startRadioRuntime(),
    startStreamersRuntime(),
    Promise.resolve({
      name: "device-auth-cleanup",
      stop: () => deviceAuthCleanupTask.stop(),
    }),
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
