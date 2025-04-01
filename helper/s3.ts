import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import "dotenv/config";

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
  fileBuffer: Buffer,
  mimeType: string
) {
  if (!bucketName || !s3) {
    return;
  }

  const params = {
    Bucket: bucketName,
    Key: `${folder}/${fileName}`,
    Body: fileBuffer,
    ContentType: mimeType,
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

    console.log(data);

    // Convert the stream to a buffer
    const streamToBuffer = (stream: any): Promise<Buffer> =>
      new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on("data", (chunk: any) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
      });

    const imageBuffer = await streamToBuffer(data.Body);
    console.log(imageBuffer);

    // Return the image buffer or the image in a desired format (e.g., base64)
    return imageBuffer;
  } catch (error) {
    console.error("Error getting image from S3", error);
    return null;
  }
}
