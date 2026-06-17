import type { Response } from "express";

export const ACTIVITY_JSON_CONTENT_TYPE =
  'application/activity+json; charset=utf-8';

export function sendActivityJson(res: Response, payload: unknown) {
  return res.type(ACTIVITY_JSON_CONTENT_TYPE).send(payload);
}

export function buildActivityResponse(
  message: string,
  activity?: unknown,
  deliveryId?: string | null,
) {
  return {
    message,
    ...(activity ? { activity } : {}),
    ...(deliveryId ? { deliveryId } : {}),
  };
}
