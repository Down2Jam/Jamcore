import { z } from "zod";

import { signAccessToken, signRefreshToken, writeSession } from "../../auth/session.js";
import db from "../../infra/db.js";
import { appConfig } from "../../config/app.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import { writeAuditEntry } from "../../infra/audit.js";
import { checkPasswordHash } from "../../infra/password.js";
import { emitDomainEvent } from "../../lib/domainEvents.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { buildUserSlug } from "../users/account.service.js";

export const createSessionSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function createSession({
  username,
  password,
  res,
  tenantId,
}: z.infer<typeof createSessionSchema> & {
  res: Parameters<typeof writeSession>[0];
  tenantId?: string | null;
}) {
  const user = await db.user.findUnique({
    where: {
      slug: buildUserSlug(username),
    },
    select: {
      slug: true,
      id: true,
      password: true,
    },
  });

  if (!user || !(await checkPasswordHash(password, user.password))) {
    throw new UnauthorizedError("Invalid username or password");
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "User",
    entityId: user.id,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new UnauthorizedError("Invalid username or password");
  }

  const accessToken = signAccessToken(user.slug);
  const refreshToken = signRefreshToken(user.slug);

  writeSession(res, refreshToken, accessToken);
  await writeAuditEntry({
    action: "session.create",
    actor: {
      slug: user.slug,
      type: "user",
    },
    resource: "session",
    metadata: {
      username,
    },
  });
  await emitDomainEvent({
    type: "session.created",
    payload: {
      userSlug: user.slug,
    },
  });

  return {
    user,
    token: accessToken,
  };
}
