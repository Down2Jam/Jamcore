import { Router } from "express";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import rateLimit from "@middleware/rateLimit";

var router = Router();

router.get(
  "/",
  rateLimit(60),

  authUser,
  getUser,

  (_req, res) => {
    res.json(res.locals.user);
  }
);

export default router;
