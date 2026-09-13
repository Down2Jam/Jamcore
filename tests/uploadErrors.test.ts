import { beforeEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import multer from "multer";
import { Readable } from "node:stream";
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

function parseMultipart(contentType: string, body: string) {
  upload.mockImplementation(multer({ storage: multer.memoryStorage() }).single("upload"));
  const req = Readable.from([Buffer.from(body)]) as unknown as Request;
  req.headers = {
    "content-type": contentType,
    "content-length": String(Buffer.byteLength(body)),
  };
  return new Promise<unknown>((resolve) => {
    createUploadMiddleware("image")(req, {} as Response, resolve);
  });
}

function filePart(field: string) {
  return `--test\r\nContent-Disposition: form-data; name="${field}"; filename="image.png"\r\nContent-Type: image/png\r\n\r\nfile bytes\r\n`;
}

it.each([
  ["missing boundary", "multipart/form-data", "file bytes", "Missing multipart boundary"],
  ["wrong field", "multipart/form-data; boundary=test", `${filePart("image")}--test--\r\n`, 'field named "upload"'],
  ["extra file", "multipart/form-data; boundary=test", `${filePart("upload")}${filePart("upload")}--test--\r\n`, "exactly one file"],
  ["truncated body", "multipart/form-data; boundary=test", filePart("upload"), "Incomplete"],
  ["malformed header", "multipart/form-data; boundary=test", "--test\r\ninvalid header\r\n\r\nfile bytes\r\n--test--\r\n", "Malformed multipart headers"],
])("returns an actionable 400 for %s", async (_label, contentType, body, message) => {
  await expect(parseMultipart(contentType, body)).resolves.toMatchObject({
    statusCode: 400,
    code: "ERR_BAD_REQUEST",
    message: expect.stringContaining(message),
  });
});

it("allows a correctly formed upload through", async () => {
  await expect(parseMultipart("multipart/form-data; boundary=test", `${filePart("upload")}--test--\r\n`)).resolves.toBeUndefined();
});

it("preserves unexpected server errors", () => {
  const error = new Error("Storage unavailable");
  upload.mockImplementation((_req, _res, next) => next(error));
  const next = vi.fn();
  createUploadMiddleware("image")({} as Request, {} as Response, next);
  expect(next).toHaveBeenCalledWith(error);
});
