import { createHash, createSign, createVerify } from "node:crypto";

import { appConfig } from "../../../config/app.js";
import { getActorPublicKeyId } from "../protocol/keys.js";
import { getLocalPrivateKeyPem } from "./key.service.js";
import { fetchRemoteActor } from "../models/remote-actor.service.js";

type ParsedSignatureHeader = {
  keyId: string;
  algorithm: string;
  headers: string[];
  signature: string;
};

function buildDigestHeader(body: string) {
  const digest = createHash("sha256").update(body).digest("base64");
  return `SHA-256=${digest}`;
}

function parseSignatureHeader(value: string) {
  const parts = value.split(",").map((part) => part.trim());
  const entries = new Map<string, string>();

  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex);
    const rawValue = part.slice(separatorIndex + 1).trim();
    entries.set(key, rawValue.replace(/^"|"$/g, ""));
  }

  const keyId = entries.get("keyId");
  const signature = entries.get("signature");
  const algorithm = entries.get("algorithm") ?? "rsa-sha256";
  const headers = (entries.get("headers") ?? "date").split(/\s+/).filter(Boolean);

  if (!keyId || !signature) {
    throw new Error("Invalid signature header");
  }

  return {
    keyId,
    signature,
    algorithm,
    headers,
  } satisfies ParsedSignatureHeader;
}

function getHeaderValue({
  header,
  method,
  path,
  host,
  date,
  digest,
}: {
  header: string;
  method: string;
  path: string;
  host: string;
  date: string;
  digest: string;
}) {
  switch (header) {
    case "(request-target)":
      return `${method.toLowerCase()} ${path}`;
    case "host":
      return host;
    case "date":
      return date;
    case "digest":
      return digest;
    default:
      throw new Error(`Unsupported signature header: ${header}`);
  }
}

function buildSigningString({
  headers,
  method,
  path,
  host,
  date,
  digest,
}: {
  headers: string[];
  method: string;
  path: string;
  host: string;
  date: string;
  digest: string;
}) {
  return headers
    .map((header) => {
      const value = getHeaderValue({ header, method, path, host, date, digest });
      return `${header.toLowerCase()}: ${value}`;
    })
    .join("\n");
}

export function createSignedRequestHeaders({
  actorId,
  inbox,
  body,
  method = "POST",
  date = new Date().toUTCString(),
}: {
  actorId: string;
  inbox: string;
  body: string;
  method?: string;
  date?: string;
}) {
  const digest = buildDigestHeader(body);
  const inboxUrl = new URL(inbox);
  const headers = ["(request-target)", "host", "date", "digest"];
  const signingString = buildSigningString({
    headers,
    method,
    path: `${inboxUrl.pathname}${inboxUrl.search}`,
    host: inboxUrl.host,
    date,
    digest,
  });

  const signer = createSign("RSA-SHA256");
  signer.update(signingString);
  signer.end();
  const signature = signer.sign(getLocalPrivateKeyPem(), "base64");

  return {
    Date: date,
    Digest: digest,
    Signature: `keyId="${getActorPublicKeyId(actorId)}",algorithm="rsa-sha256",headers="${headers.join(" ")}",signature="${signature}"`,
  };
}

export async function verifyIncomingSignature({
  method,
  path,
  host,
  date,
  digest,
  rawBody,
  signatureHeader,
}: {
  method: string;
  path: string;
  host: string;
  date: string | null;
  digest: string | null;
  rawBody: string;
  signatureHeader: string | null;
}) {
  if (!signatureHeader) {
    return false;
  }

  const parsed = parseSignatureHeader(signatureHeader);
  const actorId = parsed.keyId.split("#")[0] ?? parsed.keyId;
  const actor = await fetchRemoteActor(actorId);
  const publicKeyPem = actor.publicKey?.publicKeyPem;
  if (
    !publicKeyPem ||
    actor.id !== actorId ||
    actor.publicKey?.owner !== actor.id ||
    actor.publicKey.id !== parsed.keyId
  ) {
    return false;
  }

  if (digest) {
    const expectedDigest = buildDigestHeader(rawBody);
    if (digest !== expectedDigest) {
      return false;
    }
  }

  if (date) {
    const receivedTime = new Date(date).getTime();
    if (!Number.isFinite(receivedTime)) {
      return false;
    }
    const skewMs = Math.abs(Date.now() - receivedTime);
    if (skewMs > appConfig.federation.security.maxClockSkewSeconds * 1000) {
      return false;
    }
  }

  const signingString = buildSigningString({
    headers: parsed.headers.map((header) => header.toLowerCase()),
    method,
    path,
    host,
    date: date ?? "",
    digest: digest ?? buildDigestHeader(rawBody),
  });

  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingString);
  verifier.end();

  return verifier.verify(publicKeyPem, parsed.signature, "base64");
}

