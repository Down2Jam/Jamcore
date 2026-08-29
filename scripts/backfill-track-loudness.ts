import db from "../src/infra/db.js";
import { analyzeAudioLoudness } from "../src/features/uploads/audio-loudness.js";
import { getMusicFileBuffer } from "../src/features/tracks/audio-download.js";

const filenameFromTrackUrl = (url: string) => {
  try {
    const pathname = new URL(url, "https://local.invalid").pathname;
    const filename = pathname.split("/").pop() ?? "";
    return /^[A-Za-z0-9._-]+\.(mp3|ogg|wav)$/i.test(filename)
      ? filename
      : null;
  } catch {
    return null;
  }
};

async function main() {
  const tracks = await db.gamePageTrack.findMany({
    where: { loudnessGainDb: null },
    select: { id: true, name: true, url: true },
    orderBy: { id: "asc" },
  });
  let updated = 0;
  let skipped = 0;

  for (const track of tracks) {
    const filename = filenameFromTrackUrl(track.url);
    const buffer = filename ? await getMusicFileBuffer(filename) : null;
    if (!buffer) {
      skipped += 1;
      console.warn(`Skipped track ${track.id} (${track.name}): audio file unavailable`);
      continue;
    }

    try {
      const loudness = await analyzeAudioLoudness(buffer);
      if (!loudness) {
        skipped += 1;
        console.warn(`Skipped track ${track.id} (${track.name}): no usable measurement`);
        continue;
      }

      await db.gamePageTrack.update({
        where: { id: track.id },
        data: loudness,
      });
      updated += 1;
      console.log(
        `Updated track ${track.id} (${track.name}): ${loudness.integratedLufs.toFixed(1)} LUFS, ${loudness.loudnessGainDb.toFixed(1)} dB gain`,
      );
    } catch (error) {
      skipped += 1;
      console.warn(
        `Skipped track ${track.id} (${track.name}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`Loudness backfill complete: ${updated} updated, ${skipped} skipped`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
