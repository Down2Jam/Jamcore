import fs from "node:fs/promises";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";

import { appConfig } from "../../../config/app.js";

let privateKeyPem: string | null = null;
let publicKeyPem: string | null = null;
let initializationPromise: Promise<void> | null = null;

function getResolvedKeyPaths() {
  return {
    privateKeyPath: path.resolve(process.cwd(), appConfig.federation.security.privateKeyPath),
    publicKeyPath: path.resolve(process.cwd(), appConfig.federation.security.publicKeyPath),
  };
}

async function loadOrGenerateKeys() {
  const { privateKeyPath, publicKeyPath } = getResolvedKeyPaths();

  try {
    const [loadedPrivateKey, loadedPublicKey] = await Promise.all([
      fs.readFile(privateKeyPath, "utf8"),
      fs.readFile(publicKeyPath, "utf8"),
    ]);
    privateKeyPem = loadedPrivateKey;
    publicKeyPem = loadedPublicKey;
    return;
  } catch {
    const generated = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        format: "pem",
        type: "spki",
      },
      privateKeyEncoding: {
        format: "pem",
        type: "pkcs8",
      },
    });

    await fs.mkdir(path.dirname(privateKeyPath), { recursive: true });
    await Promise.all([
      fs.writeFile(privateKeyPath, generated.privateKey, "utf8"),
      fs.writeFile(publicKeyPath, generated.publicKey, "utf8"),
    ]);

    privateKeyPem = generated.privateKey;
    publicKeyPem = generated.publicKey;
  }
}

export async function initializeFederationKeys() {
  if (!initializationPromise) {
    initializationPromise = loadOrGenerateKeys();
  }

  await initializationPromise;
}

export function getLocalPrivateKeyPem() {
  if (!privateKeyPem) {
    throw new Error("Federation private key has not been initialized.");
  }

  return privateKeyPem;
}

export function getLocalPublicKeyPem() {
  if (!publicKeyPem) {
    throw new Error("Federation public key has not been initialized.");
  }

  return publicKeyPem;
}

