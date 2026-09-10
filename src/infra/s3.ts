import {
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import "dotenv/config";
import type { Readable } from "node:stream";

let s3: any;
let bucketName: string | undefined;

if (
  process.env.R2_ENDPOINT &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
) {
  s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  bucketName = process.env.R2_BUCKET_NAME;
}

export async function IsUsingS3() {
  return bucketName && s3;
}

export async function UploadS3File(
  folder: string,
  fileName: string,
  fileBuffer: Buffer | Readable,
  mimeType: string,
  contentLength?: number,
) {
  if (!bucketName || !s3) {
    return;
  }

  const params = {
    Bucket: bucketName,
    Key: `${folder}/${fileName}`,
    Body: fileBuffer,
    ContentType: mimeType,
    ...(typeof contentLength === "number" ? { ContentLength: contentLength } : {}),
  };

  try {
    const command = new PutObjectCommand(params);
    await s3.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

export async function GetS3File(folder: string, fileName: string) {
  if (!bucketName || !s3) {
    return null;
  }

  const params = {
    Bucket: bucketName,
    Key: `${folder}/${fileName}`,
  };

  try {
    const command = new GetObjectCommand(params);
    const data = await s3.send(command);

    // Convert the stream to a buffer
    const streamToBuffer = (stream: any): Promise<Buffer> =>
      new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on("data", (chunk: any) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
      });

    const imageBuffer = await streamToBuffer(data.Body);

    // Return the image buffer or the image in a desired format (e.g., base64)
    return imageBuffer;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "Code" in error &&
      error.Code === "NoSuchKey"
    ) {
      return null;
    }

    console.error("Error getting image from S3", error);
    return null;
  }
}

export async function HeadS3File(folder: string, fileName: string) {
  if (!bucketName || !s3) return null;
  try {
    const data = await s3.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: `${folder}/${fileName}`,
    }));
    return { contentLength: data.ContentLength as number | undefined };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (("Code" in error && error.Code === "NoSuchKey") ||
        ("$metadata" in error &&
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404))
    ) return null;
    throw error;
  }
}

export async function GetS3FileStream(
  folder: string,
  fileName: string,
  range?: string,
) {
  if (!bucketName || !s3) return null;
  try {
    const data = await s3.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: `${folder}/${fileName}`,
      ...(range ? { Range: range } : {}),
    }));
    return {
      body: data.Body as Readable,
      contentLength: data.ContentLength as number | undefined,
      contentRange: data.ContentRange as string | undefined,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "Code" in error &&
      error.Code === "NoSuchKey"
    ) return null;
    throw error;
  }
}

export async function DeleteS3Prefix(prefix: string) {
  if (!bucketName || !s3) return false;
  let continuationToken: string | undefined;
  do {
    const listed = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    const objects = (listed.Contents ?? [])
      .map((entry: { Key?: string }) => entry.Key ? { Key: entry.Key } : null)
      .filter(Boolean);
    if (objects.length > 0) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objects },
      }));
    }
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
  return true;
}
