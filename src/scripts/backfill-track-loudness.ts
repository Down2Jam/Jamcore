import db from "../infra/db.js";
import { analyzeAudioLoudness } from "../features/uploads/audio-loudness.js";
import { getMusicFileBuffer } from "../features/tracks/audio-download.js";

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
  const tracksByUrl = new Map<string, typeof tracks>();
  for (const track of tracks) {
    const matchingTracks = tracksByUrl.get(track.url) ?? [];
    matchingTracks.push(track);
    tracksByUrl.set(track.url, matchingTracks);
  }
  let updated = 0;
  let skipped = 0;

  for (const [url, matchingTracks] of tracksByUrl) {
    const track = matchingTracks[0];
    const filename = filenameFromTrackUrl(url);
    const buffer = filename ? await getMusicFileBuffer(filename) : null;
    if (!buffer) {
      skipped += matchingTracks.length;
      console.warn(
        `Skipped ${matchingTracks.length} track row(s) for ${track.name}: audio file unavailable`,
      );
      continue;
    }

    try {
      const loudness = await analyzeAudioLoudness(buffer);
      if (!loudness) {
        skipped += matchingTracks.length;
        console.warn(
          `Skipped ${matchingTracks.length} track row(s) for ${track.name}: no usable measurement`,
        );
        continue;
      }

      await db.gamePageTrack.updateMany({
        where: { id: { in: matchingTracks.map(({ id }) => id) } },
        data: loudness,
      });
      updated += matchingTracks.length;
      console.log(
        `Updated ${matchingTracks.length} track row(s) for ${track.name}: ${loudness.integratedLufs.toFixed(1)} LUFS, ${loudness.loudnessGainDb.toFixed(1)} dB gain`,
      );
    } catch (error) {
      skipped += matchingTracks.length;
      console.warn(
        `Skipped ${matchingTracks.length} track row(s) for ${track.name}: ${error instanceof Error ? error.message : String(error)}`,
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
