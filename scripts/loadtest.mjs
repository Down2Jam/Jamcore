import http from "node:http";
import { performance } from "node:perf_hooks";

const baseUrl = process.env.LOADTEST_BASE_URL ?? "http://localhost:3005";
const path = process.argv[2] ?? "/api/v1/games";
const concurrency = Number.parseInt(process.env.LOADTEST_CONCURRENCY ?? "10", 10);
const requests = Number.parseInt(process.env.LOADTEST_REQUESTS ?? "100", 10);

function requestOnce(url) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const req = http.get(url, (res) => {
      res.resume();
      res.on("end", () => {
        resolve({
          durationMs: performance.now() - startedAt,
          statusCode: res.statusCode ?? 0,
        });
      });
    });

    req.on("error", reject);
  });
}

async function run() {
  const url = new URL(path, baseUrl).toString();
  const durations = [];
  let completed = 0;
  let failures = 0;

  async function worker() {
    while (completed < requests) {
      completed += 1;
      try {
        const result = await requestOnce(url);
        durations.push(result.durationMs);
        if (result.statusCode >= 400) {
          failures += 1;
        }
      } catch {
        failures += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? 0;
  const p99 = durations[Math.max(0, Math.ceil(durations.length * 0.99) - 1)] ?? 0;

  console.log(
    JSON.stringify(
      {
        baseUrl,
        concurrency,
        failures,
        path,
        p95,
        p99,
        requests,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
