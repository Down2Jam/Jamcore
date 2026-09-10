import { Router } from "express";
import { z } from "zod";

import { setUserSiteTheme } from "@features/site-themes/usage.service";
import { requireRequestUser } from "@lib/locals";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { parseBody } from "@lib/request";

const updateSiteThemeSchema = z.object({
  themeName: z.string().trim().min(1).max(100),
});

const router = Router();

router.put(
  "/",
  rateLimit(30),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { themeName } = parseBody(req, updateSiteThemeSchema);
    const result = await setUserSiteTheme(
      requireRequestUser(res).id,
      themeName,
    );

    res.send({ message: "Site theme updated", data: result });
  }),
);

export default router;
