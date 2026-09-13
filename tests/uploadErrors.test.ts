import { beforeEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { appConfig } from "../src/config/app.js";

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("../src/features/uploads/upload-internal.js", () => ({
  images: { single: () => upload }, music: { single: () => upload }, UploadFile: vi.fn(),
}));
vi.mock("../src/infra/s3.js", () => ({ GetS3File: vi.fn() }));
import { createUploadMiddleware } from "../src/features/uploads/service.js";

beforeEach(() => vi.resetAllMocks());

it("explains the configured music size limit", () => {
  upload.mockImplementation((_req, _res, next) => next({ code: "LIMIT_FILE_SIZE" }));
  const next = vi.fn();
  createUploadMiddleware("music")({} as Request, {} as Response, next);
  expect(next.mock.calls[0][0].message).toBe(`File is too large. Maximum upload size is ${appConfig.api.limits.uploadMusicBytes / (1024 * 1024)} MiB.`);
});

it("explains which audio formats are supported", () => {
  upload.mockImplementation((_req, _res, next) => next(new Error("Invalid file type")));
  const next = vi.fn();
  createUploadMiddleware("music")({} as Request, {} as Response, next);
  expect(next.mock.calls[0][0].message).toBe("Unsupported audio format. Please upload an MP3, WAV, or OGG file.");
});
