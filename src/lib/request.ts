import type { Request } from "express";
import type { ZodType } from "zod";

export function parseBody<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(req.body);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(req.query);
}

export function parseParams<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(req.params);
}
