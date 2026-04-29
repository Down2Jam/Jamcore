import { startFeaturedStreamersJob } from "./job.js";

export async function startStreamersRuntime() {
  const task = startFeaturedStreamersJob();

  return {
    name: "streamers",
    stop() {
      task.stop();
    },
  };
}
