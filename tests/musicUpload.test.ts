import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadS3Mock, analyzeMock } = vi.hoisted(() => ({
  uploadS3Mock: vi.fn(),
  analyzeMock: vi.fn(),
}));

vi.mock("../src/infra/s3.js", () => ({
  IsUsingS3: vi.fn().mockResolvedValue(true),
  UploadS3File: uploadS3Mock,
}));
vi.mock("../src/features/uploads/audio-loudness.js", () => ({
  analyzeAudioLoudness: analyzeMock,
}));

import { music, UploadFile } from "../src/features/uploads/upload-internal.js";

async function receiveUpload(mimeType: string, content: Buffer) {
  const boundary = "test-audio-upload";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="upload"; filename="song.wav"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const req = Object.assign(Readable.from([body]), {
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length),
    },
  });
  await new Promise<void>((resolve, reject) => {
    music.single("upload")(req as any, {} as any, (error?: unknown) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return req;
}

describe("music uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadS3Mock.mockResolvedValue(true);
    analyzeMock.mockResolvedValue(null);
  });

  it.each(["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"])(
    "accepts WAV uploads labeled %s and stores a canonical MIME type",
    async (mimeType) => {
      const wav = Buffer.alloc(44);
      wav.write("RIFF");
      wav.writeUInt32LE(36, 4);
      wav.write("WAVE", 8);
      wav.write("fmt ", 12);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(44100, 24);
      wav.writeUInt32LE(88200, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      const req = await receiveUpload(mimeType, wav);
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
      await UploadFile(req, res);
      expect(uploadS3Mock).toHaveBeenCalledWith(
        "music", expect.stringMatching(/\.wav$/), wav, "audio/wav",
      );
      expect(res.json).toHaveBeenCalledWith({
        message: "File uploaded", data: expect.stringMatching(/\/music\/.*\.wav$/),
      });
    },
  );

  it("still rejects content that is not WAV when labeled with a WAV alias", async () => {
    const req = await receiveUpload("audio/x-wav", Buffer.from("not a WAV file"));
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await UploadFile(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(uploadS3Mock).not.toHaveBeenCalled();
  });

  it("still rejects unsupported audio formats", async () => {
    await expect(receiveUpload("audio/flac", Buffer.from("fLaC")))
      .rejects.toThrow("Invalid file type");
  });
});
