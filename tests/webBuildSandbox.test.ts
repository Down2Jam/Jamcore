import { describe, expect, it } from "vitest";
import { webBuildSandbox } from "../src/lib/webBuildSandbox.js";

const client = "https://d2jam.com";
const api = "https://api.d2jam.com";
const play = "https://play.d2jam.com";

describe("web build sandbox", () => {
  it("preserves the origin for workers on the configured isolated host", () => {
    expect(webBuildSandbox(play, play, client, api)).toContain("allow-same-origin");
  });

  it.each([
    [client, play],
    [api, play],
    ["https://other.example", play],
    [play, undefined],
    [client, client],
    [api, api],
    ["http://localhost:3000", "http://localhost:3000"],
    ["invalid", play],
  ])("retains isolation for request %s and configuration %s", (request, configured) => {
    expect(webBuildSandbox(request!, configured, client, api)).not.toContain("allow-same-origin");
  });
});
