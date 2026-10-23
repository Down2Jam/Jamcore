import { spawn } from "node:child_process";
import { analyzeRhythm } from "./audio-rhythm.js";
import { parseLoudnormOutput } from "./audio-loudness.js";

export async function analyzeAudio(buffer: Buffer, signal?: AbortSignal) {
  const { pcm, stderr } = await new Promise<{ pcm: Buffer; stderr: string }>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-nostats", "-threads", "1", "-i", "pipe:0", "-filter_complex",
      "[0:a:0]asplit=2[m][w];[m]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[l];[w]aresample=11025,aformat=channel_layouts=mono[p]",
      "-map", "[l]", "-f", "null", "-", "-map", "[p]", "-f", "f32le", "pipe:1"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    let bytes = 0;
    const chunks: Buffer[] = [];
    const fail = (error: Error) => { child.kill(); reject(error); };
    const abort = () => fail(new Error("Audio analysis stopped"));
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => fail(new Error("Audio analysis timed out")), 120_000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) { fail(new Error("Audio exceeds analysis duration limit")); return; }
      chunks.push(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-32_000); });
    child.on("error", fail);
    child.stdin.on("error", error => { if ((error as NodeJS.ErrnoException).code !== "EPIPE") fail(error); });
    child.on("close", code => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (code !== 0 || !bytes) reject(new Error(`Audio analysis exited with code ${code}`));
      else resolve({ pcm: Buffer.concat(chunks), stderr });
    });
    if (signal?.aborted) abort();
    else child.stdin.end(buffer);
  });
  const samples = new Float32Array(pcm.length / 4);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readFloatLE(i * 4);
  const waveform = Array.from({ length: 240 }, (_, i) => {
    let peak = 0;
    const to = Math.floor((i + 1) * samples.length / 240);
    for (let j = Math.floor(i * samples.length / 240); j < to; j++) peak = Math.max(peak, Math.abs(samples[j]));
    return Math.max(.015, Math.min(1, peak));
  });
  const rhythm = analyzeRhythm({ sampleRate: 11025, length: samples.length, numberOfChannels: 1, getChannelData: () => samples });
  return { duration: samples.length / 11025, waveform, rhythm, ...parseLoudnormOutput(stderr) };
}
