const baseUrl = process.env.LOADTEST_BASE_URL ?? "http://localhost:3000";
const iterations = Number.parseInt(process.env.SEARCH_LOADTEST_REQUESTS ?? "25", 10);
const maxP95Ms = Number.parseInt(process.env.SEARCH_LOADTEST_MAX_P95_MS ?? "500", 10);
const queries = (process.env.SEARCH_LOADTEST_QUERIES ?? "alpha,ben,theme song,team")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function quantile(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

async function timedFetch(query) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/v1/search?query=${encodeURIComponent(query)}`);
  const durationMs = performance.now() - startedAt;
  if (!response.ok) {
    throw new Error(`Search request failed for "${query}": ${response.status}`);
  }
  await response.text();
  return durationMs;
}

const durations = [];
for (let index = 0; index < iterations; index += 1) {
  const query = queries[index % queries.length];
  durations.push(await timedFetch(query));
}

const p95 = quantile(durations, 95);
const result = {
  ok: p95 <= maxP95Ms,
  count: durations.length,
  averageMs: Number((durations.reduce((sum, value) => sum + value, 0) / Math.max(durations.length, 1)).toFixed(2)),
  p95Ms: Number(p95.toFixed(2)),
  maxMs: Number(Math.max(...durations, 0).toFixed(2)),
  thresholdMs: maxP95Ms,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}
