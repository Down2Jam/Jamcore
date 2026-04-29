import express from "express";

import authUser from "@middleware/authUser";
import authUserOptional from "@middleware/authUserOptional";
import getUser from "@loaders/getUser";
import getUserOptional from "@loaders/getUserOptional";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRequestUser } from "../../lib/locals.js";
import { parseBody } from "../../lib/request.js";
import {
  addRadioClient,
  getRadioState,
  radioEmoteSchema,
  radioVoteSchema,
  resolveRadioStation,
  saveRadioVote,
  sendRadioEmote,
} from "./index.js";

export function createRadioRouter() {
  const router = express.Router();

  router.get(
    "/",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const station = resolveRadioStation(String(req.query.station ?? "all"));
      const state = await getRadioState({
        tenantId: res.locals.tenantId,
        actor: res.locals.user,
        station,
      });
      res.json(state);
    }),
  );

  router.get(
    "/events",
    asyncHandler(async (req, res) => {
      const station = resolveRadioStation(String(req.query.station ?? "all"));
      const baseTenantId = res.locals.tenantId ?? "default";
      const tenantId = station === "all" ? baseTenantId : `${baseTenantId}:radio:${station}`;
      res.locals.rawResponse = true;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      addRadioClient(tenantId, res);
      const state = await getRadioState({ tenantId: baseTenantId, station });
      res.write(`event: state\n`);
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    }),
  );

  router.post(
    "/vote",
    rateLimit(30),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, radioVoteSchema);
      const state = await saveRadioVote({
        tenantId: res.locals.tenantId,
        actor: requireRequestUser(res),
        input,
      });
      res.json(state);
    }),
  );

  router.post(
    "/emote",
    rateLimit(20, 10_000),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, radioEmoteSchema);
      const emote = await sendRadioEmote({
        tenantId: res.locals.tenantId,
        actor: requireRequestUser(res),
        input,
      });
      res.status(201).json(emote);
    }),
  );

  return router;
}
