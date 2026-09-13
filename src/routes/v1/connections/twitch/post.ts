import express from "express";
import { z } from "zod";
import authUser from "../../../../middleware/authUser.js";
import getUser from "../../../../loaders/getUser.js";
import rateLimit from "../../../../middleware/rateLimit.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { parseBody } from "../../../../lib/request.js";
import { requireRequestUser } from "../../../../lib/locals.js";
import { beginTwitchConnection, disconnectTwitch, linkTwitchUsername, readTwitchUsername, twitchCookieName, twitchCookieOptions, verifyTwitchState } from "../../../../features/users/twitch.connection.js";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("complete"), code: z.string().min(1).max(2000), state: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("disconnect") }),
]);
const router = express.Router();
router.post("/", authUser, getUser, rateLimit(10), asyncHandler(async (req, res) => {
  const input = parseBody(req, schema);
  const user = requireRequestUser(res);
  res.setHeader("Cache-Control", "no-store");
  if (input.action === "start") {
    const connection = beginTwitchConnection(user.id, res.locals.tenantId);
    res.cookie(twitchCookieName, connection.nonce, { ...twitchCookieOptions, maxAge: 10 * 60_000 });
    res.json({ url: connection.url });
  } else if (input.action === "complete") {
    const nonce = req.cookies[twitchCookieName];
    res.clearCookie(twitchCookieName, twitchCookieOptions);
    verifyTwitchState(input.state, nonce, user.id, res.locals.tenantId);
    const username = await readTwitchUsername(input.code);
    res.json(await linkTwitchUsername(user.id, username));
  } else {
    res.clearCookie(twitchCookieName, twitchCookieOptions);
    res.json(await disconnectTwitch(user.id));
  }
}));
export default router;
