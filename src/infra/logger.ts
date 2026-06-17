import winston from "winston";

import { env } from "../config/env.js";

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const serializedMeta =
      Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level}: ${message}${serializedMeta}`;
  }),
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const logger = winston.createLogger({
  level: env.nodeEnv === "production" ? "info" : "debug",
  transports: [
    new winston.transports.Console({
      format: env.nodeEnv === "production" ? productionFormat : devFormat,
    }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: productionFormat,
    }),
  ],
});

export default logger;
