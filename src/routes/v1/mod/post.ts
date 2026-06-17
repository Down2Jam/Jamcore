import express from "express";

import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import getTargetUser from "@loaders/getTargetUser";
import { asyncHandler } from "@middleware/asyncHandler";
import { updateUserRole, updateUserRoleSchema } from "@features/admin-users";
import { requireRequestUser, requireTargetUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

var router = express.Router();

router.post(
  "/",

  authUser,
  getUser,
  getTargetUser,
  asyncHandler(async (req, res) => {
    const { mod, admin } = parseBody(req, updateUserRoleSchema);
    const actor = requireRequestUser(res);
    const targetUser = requireTargetUser(res);
    const message = await updateUserRole({
      actor,
      targetUser,
      mod,
      admin,
    });

    res.status(200).send({ message });
  }),
);

export default router;

