import { expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("../src/infra/logger.js", () => ({ default: { error: logError } }));
import { errorHandler } from "../src/middleware/errorHandler.js";

it("preserves exception details in JSON logs without exposing them to clients", () => {
  const error = Object.assign(new Error("Storage write failed at private path"), { code: "EACCES" });
  const res = {
    locals: { requestId: "upload-request" },
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  errorHandler(error, {} as Request, res as unknown as Response, vi.fn());

  const metadata = logError.mock.calls[0][1];
  expect(JSON.parse(JSON.stringify(metadata))).toMatchObject({
    requestId: "upload-request",
    error: { name: "Error", message: error.message, stack: error.stack, code: "EACCES" },
  });
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    error: { code: "ApiError", message: "Internal server error", requestId: "upload-request" },
  });
});
