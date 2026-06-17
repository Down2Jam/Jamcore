import { PrismaClient } from "@prisma/client";

import "../config/env.js";
import logger from "./logger.js";
import { recordDbQuery } from "./metrics.js";

const SLOW_QUERY_THRESHOLD_MS = 200;

const db = new PrismaClient({
  log: [
    { emit: "event", level: "query" },
    { emit: "event", level: "warn" },
    { emit: "event", level: "error" },
  ],
  omit: {
    user: {
      password: true,
      email: true,
    },
    rating: {
      value: true,
    },
  },
});

db.$on("query", (event) => {
  const durationMs = Number(event.duration ?? 0);
  const target = event.target ?? "unknown.unknown";
  const [model = "unknown", action = "query"] = target.split(".");
  const slow = durationMs >= SLOW_QUERY_THRESHOLD_MS;

  recordDbQuery({
    model,
    action,
    durationMs,
    slow,
  });

  if (slow) {
    logger.warn("Slow database query", {
      model,
      action,
      durationMs,
    });
  }
});

db.$on("warn", (event) => {
  logger.warn("Prisma warning", { message: event.message, target: event.target });
});

db.$on("error", (event) => {
  logger.error("Prisma error", { message: event.message, target: event.target });
});

export default db;
