import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => {
  process.env.R2_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.R2_BUCKET_NAME = "test-bucket";
  process.env.AWS_ACCESS_KEY_ID = "test-key";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
  return { send: vi.fn() };
});

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    S3Client: class {
      send = aws.send;
    },
    GetObjectCommand: class extends Command {},
    HeadObjectCommand: class extends Command {},
    DeleteObjectsCommand: class extends Command {},
    ListObjectsV2Command: class extends Command {},
    PutObjectCommand: class extends Command {},
  };
});

import {
  GetS3FileStream,
  HeadS3File,
} from "../src/infra/s3.js";

beforeEach(() => aws.send.mockReset());

describe("S3 web build ranges", () => {
  it("reads object size without downloading the object", async () => {
    aws.send.mockResolvedValue({ ContentLength: 1234 });
    await expect(HeadS3File("game-builds/id", "video.mp4")).resolves.toEqual({
      contentLength: 1234,
    });
    expect(aws.send.mock.calls[0][0].input).toEqual({
      Bucket: "test-bucket",
      Key: "game-builds/id/video.mp4",
    });
  });

  it("passes a validated byte range through to object storage", async () => {
    const body = Readable.from(Buffer.from("bc"));
    aws.send.mockResolvedValue({
      Body: body,
      ContentLength: 2,
      ContentRange: "bytes 1-2/4",
    });
    const result = await GetS3FileStream(
      "game-builds/id",
      "video.mp4",
      "bytes=1-2",
    );
    expect(aws.send.mock.calls[0][0].input).toEqual({
      Bucket: "test-bucket",
      Key: "game-builds/id/video.mp4",
      Range: "bytes=1-2",
    });
    expect(result?.contentLength).toBe(2);
    expect(result?.contentRange).toBe("bytes 1-2/4");
  });
});
