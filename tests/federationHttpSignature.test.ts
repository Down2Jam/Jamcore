import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/app.js", async () => {
  const actual = await vi.importActual<typeof import("../src/config/app.js")>(
    "../src/config/app.js",
  );

  return {
    ...actual,
    appConfig: {
      ...actual.appConfig,
      federation: {
        ...actual.appConfig.federation,
        security: {
          ...actual.appConfig.federation.security,
          privateKeyPath: ".jamcore/test-private.pem",
          publicKeyPath: ".jamcore/test-public.pem",
        },
      },
    },
  };
});

const mocks = vi.hoisted(() => ({
  fetchRemoteActor: vi.fn(),
}));

vi.mock("../src/features/federation/models/remote-actor.service.js", () => ({
  fetchRemoteActor: mocks.fetchRemoteActor,
}));

import { buildActorPublicKey } from "../src/features/federation/protocol/keys.js";
import {
  createSignedRequestHeaders,
  verifyIncomingSignature,
} from "../src/features/federation/transport/http-signature.service.js";
import {
  getLocalPublicKeyPem,
  initializeFederationKeys,
} from "../src/features/federation/transport/key.service.js";
import { getJamActorId } from "../src/features/federation/protocol/urls.js";

describe("federation http signatures", () => {
  beforeAll(async () => {
    await initializeFederationKeys();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("signs and verifies outgoing federation requests", async () => {
    const actorId = getJamActorId();
    const inbox = "https://remote.example/inbox";
    const body = JSON.stringify({
      type: "Accept",
      actor: actorId,
    });
    const headers = createSignedRequestHeaders({
      actorId,
      inbox,
      body,
      date: new Date().toUTCString(),
    });

    mocks.fetchRemoteActor.mockResolvedValueOnce({
      id: actorId,
      type: "Group",
      publicKey: buildActorPublicKey(actorId, getLocalPublicKeyPem()),
    });

    const verified = await verifyIncomingSignature({
      method: "POST",
      path: "/inbox",
      host: "remote.example",
      date: headers.Date,
      digest: headers.Digest,
      rawBody: body,
      signatureHeader: headers.Signature,
    });

    expect(verified).toBe(true);
  });
});

