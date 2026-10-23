import db from "../infra/db.js";
import { backfillAudioAnalysis, startAudioAnalysisRuntime } from "../features/uploads/audio-analysis.runtime.js";

if (process.argv.includes("--watch")) {
  const runtime = startAudioAnalysisRuntime();
  // The shared runtime unrefs its timer because the API normally keeps it alive.
  const keepAlive = setInterval(() => {}, 60_000);
  const shutdown = async () => {
    clearInterval(keepAlive);
    await runtime.stop();
    await db.$disconnect();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} else {
  try {
    console.log(`Analyzed ${await backfillAudioAnalysis()} audio files.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
