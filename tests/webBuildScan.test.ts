import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({
  clamavHost: undefined as string | undefined,
  clamavPort: 3310,
  webBuildRequireMalwareScan: true,
}));

vi.mock("../src/config/env.js", () => ({ env: testEnv }));

import { scanWebBuildArchive } from "../src/features/games/web-build.scan.js";

const temporaryFiles: string[] = [];
const servers: net.Server[] = [];

afterEach(async () => {
  testEnv.clamavHost = undefined;
  testEnv.clamavPort = 3310;
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await Promise.all(
    temporaryFiles.splice(0).map((file) => fs.rm(file, { force: true })),
  );
});

async function temporaryArchive() {
  const file = path.resolve(
    process.cwd(),
    ".jamcore",
    `scanner-test-${Date.now()}-${Math.random()}.zip`,
  );
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "harmless test archive");
  temporaryFiles.push(file);
  return file;
}

async function startFakeClamav(response: string) {
  const server = net.createServer((socket) => {
    socket.once("data", () => {
      setTimeout(() => socket.end(`${response}\0`), 5);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  testEnv.clamavHost = "127.0.0.1";
  testEnv.clamavPort = address.port;
}

describe("web build malware scanning", () => {
  it("fails closed when scanning is required but unavailable", async () => {
    await expect(scanWebBuildArchive(await temporaryArchive())).rejects.toThrow(
      "scanning is not configured",
    );
  });

  it("accepts a clean ClamAV result", async () => {
    await startFakeClamav("stream: OK");
    await expect(scanWebBuildArchive(await temporaryArchive())).resolves.toEqual({
      scanned: true,
    });
  });

  it("rejects a ClamAV malware result", async () => {
    await startFakeClamav("stream: Win.Test.EICAR_HDB-1 FOUND");
    await expect(scanWebBuildArchive(await temporaryArchive())).rejects.toThrow(
      "rejected by the malware scanner",
    );
  });

  it("fails closed on an invalid scanner response", async () => {
    await startFakeClamav("stream: size limit exceeded. ERROR");
    await expect(scanWebBuildArchive(await temporaryArchive())).rejects.toThrow(
      "invalid result",
    );
  });
});
