import { spawn } from "node:child_process";

export const LOUDNESS_TARGET_LUFS = -14;
export const TRUE_PEAK_CEILING_DB = -1;
export const MAX_LOUDNESS_BOOST_DB = 12;
export const MAX_LOUDNESS_CUT_DB = -24;

export type AudioLoudness = {
  integratedLufs: number;
  truePeakDb: number;
  loudnessGainDb: number;
};

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateLoudnessGainDb(
  integratedLufs: number,
  truePeakDb: number,
) {
  return Math.max(
    MAX_LOUDNESS_CUT_DB,
    Math.min(
      MAX_LOUDNESS_BOOST_DB,
      LOUDNESS_TARGET_LUFS - integratedLufs,
      TRUE_PEAK_CEILING_DB - truePeakDb,
    ),
  );
}

export function parseLoudnormOutput(stderr: string): AudioLoudness | null {
  const matches = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/g);
  const json = matches?.at(-1);
  if (!json) return null;

  try {
    const measurement = JSON.parse(json) as Record<string, unknown>;
    const integratedLufs = finiteNumber(measurement.input_i);
    const truePeakDb = finiteNumber(measurement.input_tp);
    if (integratedLufs == null || truePeakDb == null) return null;

    return {
      integratedLufs,
      truePeakDb,
      loudnessGainDb: calculateLoudnessGainDb(integratedLufs, truePeakDb),
    };
  } catch {
    return null;
  }
}

export async function analyzeAudioLoudness(
  buffer: Buffer,
): Promise<AudioLoudness | null> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        "pipe:0",
        "-af",
        `loudnorm=I=${LOUDNESS_TARGET_LUFS}:TP=${TRUE_PEAK_CEILING_DB}:LRA=11:print_format=json`,
        "-f",
        "null",
        "-",
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";

    ffmpeg.stderr.setEncoding("utf8");
    ffmpeg.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg loudness analysis exited with code ${code}`));
        return;
      }
      resolve(parseLoudnormOutput(stderr));
    });

    ffmpeg.stdin.end(buffer);
  });
}
