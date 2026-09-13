import { Router } from "express";
import { z } from "zod";
import { setUserLanguage } from "@features/languages/service";
import { requireRequestUser } from "@lib/locals";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { parseBody } from "@lib/request";

const schema = z.object({ locale: z.string().trim().min(1).max(32) });
const router = Router();
router.put("/", rateLimit(30), authUser, getUser, asyncHandler(async (req, res) => {
  const { locale } = parseBody(req, schema);
  const data = await setUserLanguage(requireRequestUser(res).id, locale);
  res.send({ message: "Language updated", data });
}));
export default router;
