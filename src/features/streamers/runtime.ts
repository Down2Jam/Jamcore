import { startFeaturedStreamersJob } from "./job.js";
import { updateFeaturedStreamers } from "./service.js";

export async function startStreamersRuntime() {
  const task = startFeaturedStreamersJob();
  void updateFeaturedStreamers();

  return {
    name: "streamers",
    stop() {
      task.stop();
    },
  };
}
