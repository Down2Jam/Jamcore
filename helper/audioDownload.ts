import { existsSync } from "fs";
import { readFile } from "fs/promises";
import mime from "mime-types";
import path from "path";
import process from "process";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { GetS3File } from "./s3";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAFE_MUSIC_FILE = /^[A-Za-z0-9._-]+\.(wav|ogg|mp3)$/i;

type TrackDownloadMetadata = {
  title: string;
  artist: string;
  album?: string | null;
  bpm?: number | null;
  key?: string | null;
  date?: string | null;
  year?: string | null;
  license?: string | null;
  genre?: string | null;
  coverArt?: {
    data: Buffer;
    mimeType: string;
    width: number;
    height: number;
    depth: number;
  } | null;
};

export type DetectedAudioFormat = "mp3" | "wav" | "ogg" | "unknown";

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let crc = i << 24;
    for (let j = 0; j < 8; j += 1) {
      crc =
        (crc & 0x80000000) !== 0
          ? ((crc << 1) ^ 0x04c11db7) >>> 0
          : (crc << 1) >>> 0;
    }
    table[i] = crc >>> 0;
  }

  return table;
})();

function toSynchsafeInt(value: number) {
  return Buffer.from([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function fromSynchsafeInt(buffer: Buffer, offset: number) {
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  );
}

function sanitizeDownloadBaseName(value: string) {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return sanitized || "track";
}

function createTextFrame(frameId: string, value?: string | null) {
  if (!value?.trim()) return null;

  const payload = Buffer.concat([
    Buffer.from([0x03]),
    Buffer.from(value.trim(), "utf8"),
  ]);

  return Buffer.concat([
    Buffer.from(frameId, "ascii"),
    toSynchsafeInt(payload.length),
    Buffer.from([0x00, 0x00]),
    payload,
  ]);
}

function createBinaryFrame(frameId: string, payload: Buffer) {
  return Buffer.concat([
    Buffer.from(frameId, "ascii"),
    toSynchsafeInt(payload.length),
    Buffer.from([0x00, 0x00]),
    payload,
  ]);
}

function createUserTextFrame(description: string, value?: string | null) {
  if (!value?.trim()) return null;

  const payload = Buffer.concat([
    Buffer.from([0x03]),
    Buffer.from(description, "utf8"),
    Buffer.from([0x00]),
    Buffer.from(value.trim(), "utf8"),
  ]);

  return createBinaryFrame("TXXX", payload);
}

function createCommentFrame(description: string, value?: string | null) {
  if (!value?.trim()) return null;

  const payload = Buffer.concat([
    Buffer.from([0x03]),
    Buffer.from("eng", "ascii"),
    Buffer.from(description, "utf8"),
    Buffer.from([0x00]),
    Buffer.from(value.trim(), "utf8"),
  ]);

  return createBinaryFrame("COMM", payload);
}

function createApicFrame(coverArt?: TrackDownloadMetadata["coverArt"]) {
  if (!coverArt) return null;

  const payload = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from(coverArt.mimeType, "ascii"),
    Buffer.from([0x00]),
    Buffer.from([0x03]),
    Buffer.from([0x00]),
    coverArt.data,
  ]);

  return createBinaryFrame("APIC", payload);
}

function stripExistingId3(buffer: Buffer) {
  if (buffer.length < 10 || buffer.subarray(0, 3).toString("ascii") !== "ID3") {
    return buffer;
  }

  const size = fromSynchsafeInt(buffer, 6);
  const footerSize = buffer[5] & 0x10 ? 10 : 0;
  const totalSize = 10 + size + footerSize;
  return totalSize < buffer.length ? buffer.subarray(totalSize) : buffer;
}

function addMp3Metadata(buffer: Buffer, metadata: TrackDownloadMetadata) {
  const stripped = stripExistingId3(buffer);
  const frames: Buffer[] = [];

  const titleFrame = createTextFrame("TIT2", metadata.title);
  if (titleFrame) frames.push(titleFrame);

  const artistFrame = createTextFrame("TPE1", metadata.artist);
  if (artistFrame) frames.push(artistFrame);

  const albumFrame = createTextFrame("TALB", metadata.album);
  if (albumFrame) frames.push(albumFrame);

  const genreFrame = createTextFrame("TCON", metadata.genre);
  if (genreFrame) frames.push(genreFrame);

  const dateFrame = createTextFrame("TDRC", metadata.date);
  if (dateFrame) frames.push(dateFrame);

  const bpmFrame = createTextFrame(
    "TBPM",
    metadata.bpm != null ? String(metadata.bpm) : null,
  );
  if (bpmFrame) frames.push(bpmFrame);

  const keyFrame = createTextFrame("TKEY", metadata.key);
  if (keyFrame) frames.push(keyFrame);

  const licenseFrame = createUserTextFrame("LICENSE", metadata.license);
  if (licenseFrame) frames.push(licenseFrame);

  const commentFrame = createCommentFrame("License", metadata.license);
  if (commentFrame) frames.push(commentFrame);

  const apicFrame = createApicFrame(metadata.coverArt);
  if (apicFrame) frames.push(apicFrame);

  if (frames.length === 0) return stripped;

  const tagBody = Buffer.concat(frames);
  const header = Buffer.concat([
    Buffer.from("ID3", "ascii"),
    Buffer.from([0x04, 0x00, 0x00]),
    toSynchsafeInt(tagBody.length),
  ]);

  return Buffer.concat([header, tagBody, stripped]);
}

function createInfoSubChunk(id: string, value?: string | null) {
  if (!value?.trim()) return null;

  const content = Buffer.from(`${value.trim()}\0`, "utf8");
  const padding = content.length % 2 === 0 ? 0 : 1;
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(content.length, 0);

  return Buffer.concat([
    Buffer.from(id, "ascii"),
    chunkSize,
    content,
    padding ? Buffer.from([0x00]) : Buffer.alloc(0),
  ]);
}

function addWavMetadata(buffer: Buffer, metadata: TrackDownloadMetadata) {
  if (
    buffer.length < 12 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    return buffer;
  }

  const infoChunks: Buffer[] = [];

  const titleChunk = createInfoSubChunk("INAM", metadata.title);
  if (titleChunk) infoChunks.push(titleChunk);

  const artistChunk = createInfoSubChunk("IART", metadata.artist);
  if (artistChunk) infoChunks.push(artistChunk);

  const albumChunk = createInfoSubChunk("IPRD", metadata.album);
  if (albumChunk) infoChunks.push(albumChunk);

  const genreChunk = createInfoSubChunk("IGNR", metadata.genre);
  if (genreChunk) infoChunks.push(genreChunk);

  const dateChunk = createInfoSubChunk("ICRD", metadata.date ?? metadata.year);
  if (dateChunk) infoChunks.push(dateChunk);

  const copyrightChunk = createInfoSubChunk("ICOP", metadata.license);
  if (copyrightChunk) infoChunks.push(copyrightChunk);

  const bpmChunk = createInfoSubChunk(
    "IBPM",
    metadata.bpm != null ? String(metadata.bpm) : null,
  );
  if (bpmChunk) infoChunks.push(bpmChunk);

  const keyChunk = createInfoSubChunk("IKEY", metadata.key);
  if (keyChunk) infoChunks.push(keyChunk);

  if (infoChunks.length === 0) return buffer;

  const infoPayload = Buffer.concat([
    Buffer.from("INFO", "ascii"),
    ...infoChunks,
  ]);
  const listSize = Buffer.alloc(4);
  listSize.writeUInt32LE(infoPayload.length, 0);

  const listChunk = Buffer.concat([
    Buffer.from("LIST", "ascii"),
    listSize,
    infoPayload,
    infoPayload.length % 2 === 0 ? Buffer.alloc(0) : Buffer.from([0x00]),
  ]);

  const id3Tag = addMp3Metadata(Buffer.alloc(0), metadata);
  const id3ChunkSize = Buffer.alloc(4);
  id3ChunkSize.writeUInt32LE(id3Tag.length, 0);
  const id3Chunk = Buffer.concat([
    Buffer.from("ID3 ", "ascii"),
    id3ChunkSize,
    id3Tag,
    id3Tag.length % 2 === 0 ? Buffer.alloc(0) : Buffer.from([0x00]),
  ]);

  const output = Buffer.concat([buffer, listChunk, id3Chunk]);
  output.writeUInt32LE(output.length - 8, 4);
  return output;
}

function readUInt32LESafe(buffer: Buffer, offset: number) {
  if (offset + 4 > buffer.length) return null;
  return buffer.readUInt32LE(offset);
}

function createVorbisComment(tag: string, value?: string | null) {
  if (!value?.trim()) return null;
  return `${tag}=${value.trim()}`;
}

function buildVorbisCommentPacket(
  vendor: Buffer,
  comments: string[],
) {
  const encodedComments = comments.map((comment) => {
    const data = Buffer.from(comment, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32LE(data.length, 0);
    return Buffer.concat([length, data]);
  });

  const vendorLength = Buffer.alloc(4);
  vendorLength.writeUInt32LE(vendor.length, 0);

  const commentCount = Buffer.alloc(4);
  commentCount.writeUInt32LE(encodedComments.length, 0);

  return Buffer.concat([
    Buffer.from([0x03]),
    Buffer.from("vorbis", "ascii"),
    vendorLength,
    vendor,
    commentCount,
    ...encodedComments,
    Buffer.from([0x01]),
  ]);
}

function buildFlacPictureBlock(coverArt: NonNullable<TrackDownloadMetadata["coverArt"]>) {
  const mimeType = Buffer.from(coverArt.mimeType, "utf8");
  const description = Buffer.alloc(0);
  const dataLength = Buffer.alloc(4);
  dataLength.writeUInt32BE(coverArt.data.length, 0);
  const mimeLength = Buffer.alloc(4);
  mimeLength.writeUInt32BE(mimeType.length, 0);
  const descriptionLength = Buffer.alloc(4);
  descriptionLength.writeUInt32BE(description.length, 0);
  const width = Buffer.alloc(4);
  width.writeUInt32BE(coverArt.width, 0);
  const height = Buffer.alloc(4);
  height.writeUInt32BE(coverArt.height, 0);
  const depth = Buffer.alloc(4);
  depth.writeUInt32BE(coverArt.depth, 0);
  const colors = Buffer.alloc(4);
  colors.writeUInt32BE(0, 0);
  const pictureType = Buffer.alloc(4);
  pictureType.writeUInt32BE(3, 0);

  return Buffer.concat([
    pictureType,
    mimeLength,
    mimeType,
    descriptionLength,
    description,
    width,
    height,
    depth,
    colors,
    dataLength,
    coverArt.data,
  ]);
}

function computeOggCrc(page: Buffer) {
  let crc = 0;
  for (let i = 0; i < page.length; i += 1) {
    crc =
      (((crc << 8) >>> 0) ^
        OGG_CRC_TABLE[((crc >>> 24) ^ page[i]) & 0xff]) >>>
      0;
  }
  return crc >>> 0;
}

function buildOggPage(args: {
  serial: number;
  sequence: number;
  granulePosition: bigint;
  headerType: number;
  packetData: Buffer;
  packetContinuesFromPrevious: boolean;
  packetContinuesToNext: boolean;
}) {
  const segments: number[] = [];
  let remaining = args.packetData.length;

  if (remaining === 0) {
    segments.push(0);
  } else {
    while (remaining >= 255) {
      segments.push(255);
      remaining -= 255;
    }
    segments.push(remaining);
    if (
      !args.packetContinuesToNext &&
      args.packetData.length > 0 &&
      args.packetData.length % 255 === 0
    ) {
      segments.push(0);
    }
  }

  const header = Buffer.alloc(27 + segments.length);
  header.write("OggS", 0, "ascii");
  header[4] = 0x00;

  let headerType = args.headerType & 0xfe;
  if (args.packetContinuesFromPrevious) headerType |= 0x01;
  header[5] = headerType;
  header.writeBigUInt64LE(args.granulePosition, 6);
  header.writeUInt32LE(args.serial >>> 0, 14);
  header.writeUInt32LE(args.sequence >>> 0, 18);
  header.writeUInt32LE(0, 22);
  header[26] = segments.length;

  segments.forEach((segment, index) => {
    header[27 + index] = segment;
  });

  const page = Buffer.concat([header, args.packetData]);
  page.writeUInt32LE(computeOggCrc(page), 22);
  return page;
}

function addOggMetadata(buffer: Buffer, metadata: TrackDownloadMetadata) {
  if (buffer.length < 27 || buffer.subarray(0, 4).toString("ascii") !== "OggS") {
    return buffer;
  }

  type OggPage = {
    offset: number;
    length: number;
    headerType: number;
    granulePosition: bigint;
    serial: number;
    sequence: number;
    segments: number[];
    data: Buffer;
  };

  const pages: OggPage[] = [];
  let offset = 0;

  while (offset + 27 <= buffer.length) {
    if (buffer.subarray(offset, offset + 4).toString("ascii") !== "OggS") {
      return buffer;
    }

    const pageSegments = buffer[offset + 26];
    const segmentTableStart = offset + 27;
    const segmentTableEnd = segmentTableStart + pageSegments;
    if (segmentTableEnd > buffer.length) return buffer;

    const segments = Array.from(buffer.subarray(segmentTableStart, segmentTableEnd));
    const dataLength = segments.reduce((sum, value) => sum + value, 0);
    const dataStart = segmentTableEnd;
    const dataEnd = dataStart + dataLength;
    if (dataEnd > buffer.length) return buffer;

    pages.push({
      offset,
      length: dataEnd - offset,
      headerType: buffer[offset + 5],
      granulePosition: buffer.readBigUInt64LE(offset + 6),
      serial: buffer.readUInt32LE(offset + 14),
      sequence: buffer.readUInt32LE(offset + 18),
      segments,
      data: buffer.subarray(dataStart, dataEnd),
    });

    offset = dataEnd;
  }

  if (pages.length === 0) return buffer;

  const packets: Buffer[] = [];
  let currentPacketParts: Buffer[] = [];
  let currentPageIndex = -1;
  let packetCount = 0;
  let nextPageStartIndex = pages.length;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    let dataOffset = 0;

    for (let segmentIndex = 0; segmentIndex < page.segments.length; segmentIndex += 1) {
      const segmentLength = page.segments[segmentIndex];
      const segmentData = page.data.subarray(dataOffset, dataOffset + segmentLength);
      currentPacketParts.push(segmentData);
      dataOffset += segmentLength;
      currentPageIndex = pageIndex;

      if (segmentLength < 255) {
        packets.push(Buffer.concat(currentPacketParts));
        currentPacketParts = [];
        packetCount += 1;

        if (packetCount === 3) {
          if (segmentIndex !== page.segments.length - 1) {
            return buffer;
          }
          nextPageStartIndex = pageIndex + 1;
          break;
        }
      }
    }

    if (packetCount === 3) {
      break;
    }
  }

  if (packets.length < 3 || currentPageIndex < 1) return buffer;

  const identificationPacket = packets[0];
  const originalCommentPacket = packets[1];
  const setupPacket = packets[2];

  if (
    identificationPacket.length < 7 ||
    identificationPacket[0] !== 0x01 ||
    identificationPacket.subarray(1, 7).toString("ascii") !== "vorbis"
  ) {
    return buffer;
  }

  if (
    originalCommentPacket.length < 11 ||
    originalCommentPacket[0] !== 0x03 ||
    originalCommentPacket.subarray(1, 7).toString("ascii") !== "vorbis"
  ) {
    return buffer;
  }

  const vendorLength = readUInt32LESafe(originalCommentPacket, 7);
  if (vendorLength == null) return buffer;
  const vendorStart = 11;
  const vendorEnd = vendorStart + vendorLength;
  if (vendorEnd > originalCommentPacket.length) return buffer;

  const vendor = originalCommentPacket.subarray(vendorStart, vendorEnd);
  const comments = [
    createVorbisComment("TITLE", metadata.title),
    createVorbisComment("ARTIST", metadata.artist),
    createVorbisComment("ALBUM", metadata.album),
    createVorbisComment("GENRE", metadata.genre),
    createVorbisComment("DATE", metadata.date),
    createVorbisComment("YEAR", metadata.year),
    createVorbisComment("LICENSE", metadata.license),
    createVorbisComment(
      "BPM",
      metadata.bpm != null ? String(metadata.bpm) : null,
    ),
    createVorbisComment("INITIALKEY", metadata.key),
    createVorbisComment(
      "METADATA_BLOCK_PICTURE",
      metadata.coverArt
        ? buildFlacPictureBlock(metadata.coverArt).toString("base64")
        : null,
    ),
  ].filter((value): value is string => Boolean(value));

  const commentPacket = buildVorbisCommentPacket(vendor, comments);
  const serial = pages[0].serial;
  const sequenceBase = pages[0].sequence;
  const rebuiltPages: Buffer[] = [];
  let sequence = sequenceBase;

  const headerPackets = [identificationPacket, commentPacket, setupPacket];

  headerPackets.forEach((packet, packetIndex) => {
    let packetOffset = 0;
    let firstChunk = true;

    while (packetOffset < packet.length || (packet.length === 0 && firstChunk)) {
      const remaining = packet.length - packetOffset;
      const chunkLength =
        packet.length === 0
          ? 0
          : Math.min(remaining, 255 * 255);
      const chunk = packet.subarray(packetOffset, packetOffset + chunkLength);
      const packetContinuesToNext = packetOffset + chunkLength < packet.length;
      const packetContinuesFromPrevious = !firstChunk;
      const isFirstPage = rebuiltPages.length === 0;

      rebuiltPages.push(
        buildOggPage({
          serial,
          sequence,
          granulePosition: 0n,
          headerType: isFirstPage ? 0x02 : 0x00,
          packetData: chunk,
          packetContinuesFromPrevious,
          packetContinuesToNext,
        }),
      );

      packetOffset += chunkLength;
      firstChunk = false;
      sequence += 1;
    }
  });

  const sequenceDelta = rebuiltPages.length - nextPageStartIndex;
  const remainderPages = pages.slice(nextPageStartIndex).map((page) => {
    const pageCopy = Buffer.from(buffer.subarray(page.offset, page.offset + page.length));
    pageCopy.writeUInt32LE((page.sequence + sequenceDelta) >>> 0, 18);
    pageCopy.writeUInt32LE(0, 22);
    pageCopy.writeUInt32LE(computeOggCrc(pageCopy), 22);
    return pageCopy;
  });

  return Buffer.concat([...rebuiltPages, ...remainderPages]);
}

export function extractMusicFilenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split("/").pop() ?? "";
    return SAFE_MUSIC_FILE.test(filename) ? filename : null;
  } catch {
    return null;
  }
}

export async function getMusicFileBuffer(filename: string) {
  if (!SAFE_MUSIC_FILE.test(filename)) return null;

  const musicPath = path.join(process.cwd(), "public", "music", filename);
  if (existsSync(musicPath)) {
    return readFile(musicPath);
  }

  return GetS3File("music", filename);
}

async function getImageFileBuffer(filename: string) {
  const imagePath = path.join(process.cwd(), "public", "images", filename);
  if (existsSync(imagePath)) {
    return readFile(imagePath);
  }

  return GetS3File("images", filename);
}

export function extractImageFilenameFromUrl(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split("/").pop() ?? "";
    return /^[A-Za-z0-9._-]+\.(png|jpe?g|gif|webp)$/i.test(filename)
      ? filename
      : null;
  } catch {
    return null;
  }
}

export async function getEmbeddedCoverArt(
  ...candidateUrls: Array<string | null | undefined>
) {
  for (const candidateUrl of candidateUrls) {
    const filename = extractImageFilenameFromUrl(candidateUrl);
    if (!filename) continue;

    const source = await getImageFileBuffer(filename);
    if (!source) continue;

    const image = sharp(source, { animated: true }).rotate();
    const resized = image.resize(1200, 1200, {
      fit: "inside",
      withoutEnlargement: true,
    });
    const metadata = await resized.metadata();
    const jpeg = await resized.jpeg({ quality: 88 }).toBuffer();

    return {
      data: jpeg,
      mimeType: "image/jpeg",
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      depth: metadata.channels ? metadata.channels * 8 : 24,
    };
  }

  return null;
}

export function detectAudioFormat(buffer: Buffer): DetectedAudioFormat {
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "wav";
  }

  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return "ogg";
  }

  if (
    (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") ||
    (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return "mp3";
  }

  return "unknown";
}

export function getExtensionForAudioFormat(format: DetectedAudioFormat) {
  switch (format) {
    case "wav":
      return ".wav";
    case "ogg":
      return ".ogg";
    case "mp3":
      return ".mp3";
    default:
      return "";
  }
}

export function buildTrackDownloadFilename(
  songName: string,
  originalFilename: string,
  detectedFormat?: DetectedAudioFormat,
) {
  const extension =
    getExtensionForAudioFormat(detectedFormat ?? "unknown") ||
    path.extname(originalFilename) ||
    ".mp3";
  return `${sanitizeDownloadBaseName(songName)}${extension}`;
}

export function createContentDisposition(filename: string) {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function getMusicContentType(filename: string) {
  return mime.lookup(filename) || "application/octet-stream";
}

export function getContentTypeForAudioFormat(
  format: DetectedAudioFormat,
  filename: string,
) {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "mp3":
      return "audio/mpeg";
    default:
      return getMusicContentType(filename);
  }
}

export function embedTrackDownloadMetadata(
  buffer: Buffer,
  filename: string,
  metadata: TrackDownloadMetadata,
) {
  const format = detectAudioFormat(buffer);

  if (format === "mp3") {
    return addMp3Metadata(buffer, metadata);
  }

  if (format === "wav") {
    return addWavMetadata(buffer, metadata);
  }

  if (format === "ogg") {
    return addOggMetadata(buffer, metadata);
  }

  return buffer;
}
