import express from "express";

import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import getTargetEvent from "@loaders/getTargetEvent";
import rateLimit from "@middleware/rateLimit";
import logger from "@infra/logger";
import { asyncHandler } from "@middleware/asyncHandler";
import { createEvent, createEventSchema } from "./service.js";
import { requireRequestUser } from "../../lib/locals.js";
import { parseBody } from "../../lib/request.js";

export function createEventsRouter() {
  const router = express.Router();

  router.get(
    "/:eventSlug",
    rateLimit(),
    getTargetEvent,
    (_req, res) => {
      logger.info(`Event with id ${res.locals.targetEvent.id} fetched`);
      res.send({ message: "Event fetched", data: res.locals.targetEvent });
    },
  );

  router.post(
    "/",
    rateLimit(),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, createEventSchema);
      const user = requireRequestUser(res);
      const event = await createEvent({
        ...input,
        hostId: user.id,
      });

      res.status(201).send({ message: "Event created", data: event });
    }),
  );

  return router;
}
