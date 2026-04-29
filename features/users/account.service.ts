import fs from "fs";
import path from "path";
import process from "process";
import { z } from "zod";

import { signAccessToken, signRefreshToken, writeSession } from "../../auth/session.js";
import { env } from "../../config/env.js";
import { assignCoreEntityTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import logger from "../../infra/logger.js";
import { hashPassword } from "../../infra/password.js";
import { enqueueSearchEntityIndex } from "../search/indexing.service.js";
import { ConfigurationError, ConflictError } from "../../lib/errors.js";

export const createUserAccountSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(8),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().email().optional().nullable(),
  ),
});

export function buildUserSlug(username: string) {
  return username.toLowerCase().replace(/\s+/g, "_");
}

function getRandomProfilePictureUrl(): string | null {
  const pfpsPath = path.join(process.cwd(), "public", "pfps");

  if (!fs.existsSync(pfpsPath)) {
    return null;
  }

  const files = fs
    .readdirSync(pfpsPath)
    .filter((file) => /\.(png|jpe?g|gif|webp)$/i.test(file));

  if (files.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * files.length);
  return `${env.clientOrigin}/api/v1/pfp/${files[randomIndex]}`;
}

export async function createUserAccount({
  username,
  password,
  email,
  res,
  tenantId,
}: z.infer<typeof createUserAccountSchema> & {
  res: Parameters<typeof writeSession>[0];
  tenantId?: string;
}) {
  if (!env.tokenSecret) {
    throw new ConfigurationError("There is no token secret.");
  }

  const slug = buildUserSlug(username);
  const existingUser = await db.user.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existingUser) {
    throw new ConflictError("Username already exists.");
  }

  const user = await db.user.create({
    data: {
      slug,
      name: username,
      password: await hashPassword(password),
      email: email ?? null,
      profilePicture: getRandomProfilePictureUrl(),
    },
  });
  if (tenantId) {
    await assignCoreEntityTenant({
      entityType: "User",
      entityId: user.id,
      tenantId,
    });
  }

  logger.info(
    `Created user with username: ${username} (ID: ${user.id}, Slug: ${user.slug})`,
  );

  await enqueueSearchEntityIndex({
    entityType: "user",
    entityId: user.id,
    tenantId,
  });

  const accessToken = signAccessToken(user.slug);
  const refreshToken = signRefreshToken(user.slug);
  writeSession(res, refreshToken, accessToken);

  return {
    user,
    token: accessToken,
  };
}

export async function deleteUserAccount({
  userId,
  tenantId,
}: {
  userId: number;
  tenantId?: string | null;
}) {
  await db.user.delete({
    where: { id: userId },
  });

  await enqueueSearchEntityIndex({
    entityType: "user",
    entityId: userId,
    tenantId,
  });

  logger.info(`Deleted user with id ${userId}`);
}

