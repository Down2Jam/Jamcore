import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  getPersistedRemoteActor: vi.fn(),
  lookup: vi.fn(),
  upsertPersistedRemoteActor: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.axiosGet,
  },
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.lookup,
}));

vi.mock("../features/federation/state/state.service.js", () => ({
  getPersistedRemoteActor: mocks.getPersistedRemoteActor,
  upsertPersistedRemoteActor: mocks.upsertPersistedRemoteActor,
}));

import {
  clearRemoteActorCache,
  fetchRemoteActor,
} from "../features/federation/models/remote-actor.service.js";

describe("remote actor fetching", () => {
  beforeEach(() => {
    clearRemoteActorCache();
    vi.clearAllMocks();
    mocks.getPersistedRemoteActor.mockResolvedValue(null);
  });

  it("rejects loopback actor URLs before making an outbound request", async () => {
    await expect(fetchRemoteActor("http://127.0.0.1:3000/ap/actor")).rejects.toThrow(
      "private address",
    );

    expect(mocks.axiosGet).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    mocks.lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(fetchRemoteActor("https://actor.example/ap/user")).rejects.toThrow(
      "private address",
    );

    expect(mocks.axiosGet).not.toHaveBeenCalled();
  });
});
