import express from "express";
import authUser from "../../../../middleware/authUser.js";
import rateLimit from "../../../../middleware/rateLimit.js";
import { twitchConfiguration } from "../../../../features/users/twitch.connection.js";

const router = express.Router();
router.get("/", authUser, rateLimit(30), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ configured: twitchConfiguration().configured });
});
export default router;
