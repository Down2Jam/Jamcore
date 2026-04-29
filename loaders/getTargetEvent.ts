import { Request, Response, NextFunction } from "express";

import db from "../infra/db.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";

async function getTargetEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { targetEventId, targetEventSlug } = req.body ?? {};
  const {
    targetEventId: queryTargetEventId,
    targetEventSlug: queryTargetEventSlug,
  } = req.query;
  const {
    eventSlug: paramsEventSlug,
    targetEventSlug: paramsTargetEventSlug,
  } = req.params;

  const eventId = targetEventId || queryTargetEventId;
  const eventSlug =
    targetEventSlug ||
    queryTargetEventSlug ||
    paramsEventSlug ||
    paramsTargetEventSlug;

  const normalizedEventId =
    eventId !== undefined && eventId !== null && eventId !== "" ? Number(eventId) : null;

  if ((!normalizedEventId || Number.isNaN(normalizedEventId)) && !eventSlug) {
    next(new BadRequestError("Event id or slug missing."));
    return;
  }

  let event;

  if (normalizedEventId && !Number.isNaN(normalizedEventId)) {
    event = await db.event.findUnique({
      where: {
        id: normalizedEventId,
      },
    });
  } else {
    event = await db.event.findUnique({
      where: {
        slug: eventSlug as string,
      },
    });
  }

  if (!event) {
    next(new NotFoundError("Event missing."));
    return;
  }

  res.locals.targetEvent = event;
  next();
}

export default getTargetEvent;
