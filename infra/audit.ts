import fs from "node:fs/promises";
import path from "node:path";

import logger from "./logger.js";

type AuditActor = {
  id?: number | null;
  slug?: string | null;
  type: "user" | "service" | "system";
};

export async function writeAuditEntry({
  action,
  actor,
  metadata,
  resource,
}: {
  action: string;
  actor: AuditActor;
  metadata?: Record<string, unknown>;
  resource: string;
}) {
  const entry = {
    action,
    actor,
    metadata: metadata ?? {},
    resource,
    timestamp: new Date().toISOString(),
  };

  const logDir = path.resolve(process.cwd(), "logs");
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(
    path.join(logDir, "audit.log"),
    `${JSON.stringify(entry)}\n`,
    "utf8",
  );

  logger.info("Audit entry written", entry);
}
