import fs from "node:fs";
import net from "node:net";

import { env } from "../../config/env.js";
import {
  BadRequestError,
  ServiceUnavailableError,
} from "../../lib/errors.js";

export async function scanWebBuildArchive(filePath: string) {
  if (!env.clamavHost) {
    if (env.webBuildRequireMalwareScan) {
      throw new ServiceUnavailableError("Web-build scanning is not configured.");
    }
    return { scanned: false };
  }

  const result = await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({
      host: env.clamavHost,
      port: env.clamavPort,
      timeout: 120_000,
    });
    let response = "";
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const input = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
      input.on("data", (chunk: Buffer) => {
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        if (!socket.write(Buffer.concat([length, chunk]))) input.pause();
      });
      socket.on("drain", () => input.resume());
      input.on("end", () => socket.write(Buffer.alloc(4)));
      input.on("error", reject);
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.on("end", () => resolve(response.replace(/\0/g, "").trim()));
    socket.on("timeout", () => socket.destroy(new Error("Malware scan timed out.")));
    socket.on("error", reject);
  }).catch((error) => {
    throw new ServiceUnavailableError(
      "The malware scanner is unavailable. Try the upload again later.",
      error instanceof Error ? error.message : String(error),
    );
  });

  if (result.endsWith("FOUND")) {
    throw new BadRequestError("The web build was rejected by the malware scanner.");
  }
  if (!result.endsWith("OK")) {
    throw new ServiceUnavailableError("The malware scanner returned an invalid result.");
  }
  return { scanned: true };
}
