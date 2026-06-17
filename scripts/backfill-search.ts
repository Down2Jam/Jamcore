import { ensureCoreTenantColumns } from "../src/infra/coreTenantStore.js";
import { ensurePlatformTables } from "../src/infra/platformStore.js";
import { ensureSearchTables } from "../src/infra/searchStore.js";
import {
  processSearchReindexRun,
  startSearchReindexRun,
} from "../src/features/search/indexing.service.js";
import { getSearchReindexRunById } from "../src/infra/searchStore.js";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const tenantId = readArg("tenant") ?? null;
  const scope = readArg("scope") === "global" ? "global" : "tenant";
  const batchSize = Number.parseInt(readArg("batchSize") ?? "100", 10);

  await ensurePlatformTables();
  await ensureCoreTenantColumns();
  await ensureSearchTables();

  const runId = await startSearchReindexRun({
    tenantId,
    scope,
    batchSize: Number.isNaN(batchSize) ? 100 : batchSize,
  });

  while (true) {
    const run = await getSearchReindexRunById(runId);
    if (!run) {
      throw new Error(`Missing search reindex run: ${runId}`);
    }
    if (run.status === "completed") {
      console.log(JSON.stringify({ ok: true, runId, status: run.status, processed: run.processedCount, total: run.totalCount }, null, 2));
      break;
    }
    if (run.status === "failed") {
      throw new Error(`Search reindex run failed: ${run.lastError ?? "unknown error"}`);
    }

    await processSearchReindexRun(runId);
  }
}

void main();
