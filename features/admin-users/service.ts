import { z } from "zod";

import db from "../../infra/db.js";
import { BadRequestError, ForbiddenError } from "../../lib/errors.js";

export const updateUserRoleSchema = z.object({
  mod: z.boolean().optional().default(false),
  admin: z.boolean().optional().default(false),
});

type AdminActor = {
  id: number;
  admin?: boolean | null;
  createdAt: Date;
};

type TargetUserRole = {
  id: number;
  admin?: boolean | null;
  createdAt: Date;
};

export async function updateUserRole({
  actor,
  targetUser,
  mod,
  admin,
}: {
  actor: AdminActor;
  targetUser: TargetUserRole;
  mod: boolean;
  admin: boolean;
}) {
  if (!actor.admin) {
    throw new ForbiddenError("You are not authorized to perform this action.");
  }

  if (admin) {
    if (targetUser.admin) {
      throw new BadRequestError("Target user is already an admin.");
    }

    await db.user.update({
      where: { id: targetUser.id },
      data: { admin: true, mod: true },
    });

    return "Target user has been promoted to admin.";
  }

  if (!targetUser.admin) {
    await db.user.update({
      where: { id: targetUser.id },
      data: { mod },
    });

    return "Mod status updated.";
  }

  if (targetUser.createdAt <= actor.createdAt) {
    throw new ForbiddenError(
      "You cannot demote admins who were added before or at the same time as you.",
    );
  }

  await db.user.update({
    where: { id: targetUser.id },
    data: { admin: false, mod },
  });

  return "Target admin has been demoted.";
}

