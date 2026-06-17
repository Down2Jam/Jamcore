type HttpMetric = {
  count: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

type DbMetric = {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  slowCount: number;
};

type CacheMetric = {
  hits: number;
  misses: number;
};

type JobMetric = {
  success: number;
  failure: number;
  deadLettered: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

type SearchMetric = {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  totalResults: number;
};

type SearchIndexMetric = {
  count: number;
  totalDocuments: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

const startedAt = Date.now();
const httpMetrics = new Map<string, HttpMetric>();
const dbMetrics = new Map<string, DbMetric>();
const cacheMetrics = new Map<string, CacheMetric>();
const jobMetrics = new Map<string, JobMetric>();
const searchMetrics = new Map<string, SearchMetric>();
const searchIndexMetrics = new Map<string, SearchIndexMetric>();
const httpDurationSamples = new Map<string, number[]>();

function escapeLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function recordHttpRequest({
  method,
  route,
  statusCode,
  durationMs,
}: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}) {
  const key = `${method} ${route}`;
  const metric = httpMetrics.get(key) ?? {
    count: 0,
    errors: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  };

  metric.count += 1;
  metric.totalDurationMs += durationMs;
  metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);
  if (statusCode >= 500) {
    metric.errors += 1;
  }

  httpMetrics.set(key, metric);

  const samples = httpDurationSamples.get(key) ?? [];
  samples.push(durationMs);
  if (samples.length > 256) {
    samples.shift();
  }
  httpDurationSamples.set(key, samples);
}

export function recordDbQuery({
  model,
  action,
  durationMs,
  slow,
}: {
  model: string;
  action: string;
  durationMs: number;
  slow: boolean;
}) {
  const key = `${model}.${action}`;
  const metric = dbMetrics.get(key) ?? {
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    slowCount: 0,
  };

  metric.count += 1;
  metric.totalDurationMs += durationMs;
  metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);
  if (slow) {
    metric.slowCount += 1;
  }

  dbMetrics.set(key, metric);
}

export function recordCacheRequest({
  cacheName,
  hit,
}: {
  cacheName: string;
  hit: boolean;
}) {
  const metric = cacheMetrics.get(cacheName) ?? {
    hits: 0,
    misses: 0,
  };
  if (hit) {
    metric.hits += 1;
  } else {
    metric.misses += 1;
  }
  cacheMetrics.set(cacheName, metric);
}

export function recordJobExecution({
  jobType,
  success,
  deadLettered,
  durationMs,
}: {
  jobType: string;
  success: boolean;
  deadLettered: boolean;
  durationMs: number;
}) {
  const metric = jobMetrics.get(jobType) ?? {
    success: 0,
    failure: 0,
    deadLettered: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  };

  if (success) {
    metric.success += 1;
  } else {
    metric.failure += 1;
  }
  if (deadLettered) {
    metric.deadLettered += 1;
  }
  metric.totalDurationMs += durationMs;
  metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);
  jobMetrics.set(jobType, metric);
}

export function recordSearchQuery(input: {
  queryType: string;
  durationMs: number;
  resultCount: number;
}) {
  const metric = searchMetrics.get(input.queryType) ?? {
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    totalResults: 0,
  };

  metric.count += 1;
  metric.totalDurationMs += input.durationMs;
  metric.maxDurationMs = Math.max(metric.maxDurationMs, input.durationMs);
  metric.totalResults += input.resultCount;
  searchMetrics.set(input.queryType, metric);
}

export function recordSearchIndexing(input: {
  entityType: string;
  documentCount: number;
  durationMs: number;
}) {
  const metric = searchIndexMetrics.get(input.entityType) ?? {
    count: 0,
    totalDocuments: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  };

  metric.count += 1;
  metric.totalDocuments += input.documentCount;
  metric.totalDurationMs += input.durationMs;
  metric.maxDurationMs = Math.max(metric.maxDurationMs, input.durationMs);
  searchIndexMetrics.set(input.entityType, metric);
}

function quantile(values: number[], percentile: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

export async function renderMetrics() {
  const lines = [
    "# HELP jamcore_uptime_seconds Process uptime in seconds",
    "# TYPE jamcore_uptime_seconds gauge",
    `jamcore_uptime_seconds ${((Date.now() - startedAt) / 1000).toFixed(3)}`,
    "# HELP jamcore_http_requests_total Total HTTP requests by method and route",
    "# TYPE jamcore_http_requests_total counter",
  ];

  for (const [key, metric] of httpMetrics.entries()) {
    const [method, ...routeParts] = key.split(" ");
    const route = routeParts.join(" ");
    const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}"`;
    lines.push(`jamcore_http_requests_total{${labels}} ${metric.count}`);
    lines.push(`jamcore_http_request_errors_total{${labels}} ${metric.errors}`);
    lines.push(
      `jamcore_http_request_duration_ms_sum{${labels}} ${metric.totalDurationMs.toFixed(3)}`,
    );
    lines.push(
      `jamcore_http_request_duration_ms_max{${labels}} ${metric.maxDurationMs.toFixed(3)}`,
    );
    const samples = httpDurationSamples.get(key) ?? [];
    lines.push(
      `jamcore_http_request_duration_ms_p95{${labels}} ${quantile(samples, 95).toFixed(3)}`,
    );
    lines.push(
      `jamcore_http_request_duration_ms_p99{${labels}} ${quantile(samples, 99).toFixed(3)}`,
    );
  }

  lines.push("# HELP jamcore_db_queries_total Total database queries by model and action");
  lines.push("# TYPE jamcore_db_queries_total counter");

  for (const [key, metric] of dbMetrics.entries()) {
    const [model, action] = key.split(".");
    const labels = `model="${escapeLabel(model)}",action="${escapeLabel(action)}"`;
    lines.push(`jamcore_db_queries_total{${labels}} ${metric.count}`);
    lines.push(
      `jamcore_db_query_duration_ms_sum{${labels}} ${metric.totalDurationMs.toFixed(3)}`,
    );
    lines.push(
      `jamcore_db_query_duration_ms_max{${labels}} ${metric.maxDurationMs.toFixed(3)}`,
    );
    lines.push(`jamcore_db_queries_slow_total{${labels}} ${metric.slowCount}`);
  }

  lines.push("# HELP jamcore_cache_hits_total Cache hits by cache name");
  lines.push("# TYPE jamcore_cache_hits_total counter");
  for (const [cacheName, metric] of cacheMetrics.entries()) {
    const labels = `cache="${escapeLabel(cacheName)}"`;
    lines.push(`jamcore_cache_hits_total{${labels}} ${metric.hits}`);
    lines.push(`jamcore_cache_misses_total{${labels}} ${metric.misses}`);
  }

  lines.push("# HELP jamcore_jobs_success_total Background job successes by type");
  lines.push("# TYPE jamcore_jobs_success_total counter");
  for (const [jobType, metric] of jobMetrics.entries()) {
    const labels = `job_type="${escapeLabel(jobType)}"`;
    lines.push(`jamcore_jobs_success_total{${labels}} ${metric.success}`);
    lines.push(`jamcore_jobs_failure_total{${labels}} ${metric.failure}`);
    lines.push(`jamcore_jobs_dead_letter_total{${labels}} ${metric.deadLettered}`);
    lines.push(
      `jamcore_job_duration_ms_sum{${labels}} ${metric.totalDurationMs.toFixed(3)}`,
    );
    lines.push(
      `jamcore_job_duration_ms_max{${labels}} ${metric.maxDurationMs.toFixed(3)}`,
    );
  }

  lines.push("# HELP jamcore_search_queries_total Search queries by requested type");
  lines.push("# TYPE jamcore_search_queries_total counter");
  for (const [queryType, metric] of searchMetrics.entries()) {
    const labels = `query_type="${escapeLabel(queryType)}"`;
    lines.push(`jamcore_search_queries_total{${labels}} ${metric.count}`);
    lines.push(
      `jamcore_search_query_duration_ms_sum{${labels}} ${metric.totalDurationMs.toFixed(3)}`,
    );
    lines.push(
      `jamcore_search_query_duration_ms_max{${labels}} ${metric.maxDurationMs.toFixed(3)}`,
    );
    lines.push(`jamcore_search_results_total{${labels}} ${metric.totalResults}`);
  }

  lines.push("# HELP jamcore_search_index_runs_total Search indexing runs by entity type");
  lines.push("# TYPE jamcore_search_index_runs_total counter");
  for (const [entityType, metric] of searchIndexMetrics.entries()) {
    const labels = `entity_type="${escapeLabel(entityType)}"`;
    lines.push(`jamcore_search_index_runs_total{${labels}} ${metric.count}`);
    lines.push(`jamcore_search_index_documents_total{${labels}} ${metric.totalDocuments}`);
    lines.push(
      `jamcore_search_index_duration_ms_sum{${labels}} ${metric.totalDurationMs.toFixed(3)}`,
    );
    lines.push(
      `jamcore_search_index_duration_ms_max{${labels}} ${metric.maxDurationMs.toFixed(3)}`,
    );
  }

  const queuedJobs = await listJobsFromDb(500);
  const pending = queuedJobs.filter((job) => job.status === "pending").length;
  const running = queuedJobs.filter((job) => job.status === "running").length;
  const dead = queuedJobs.filter((job) => job.status === "dead").length;
  lines.push("# HELP jamcore_queue_depth Queue depth by job status");
  lines.push("# TYPE jamcore_queue_depth gauge");
  lines.push(`jamcore_queue_depth{status="pending"} ${pending}`);
  lines.push(`jamcore_queue_depth{status="running"} ${running}`);
  lines.push(`jamcore_queue_depth{status="dead"} ${dead}`);

  return `${lines.join("\n")}\n`;
}
import { listJobsFromDb } from "./platformStore.js";
