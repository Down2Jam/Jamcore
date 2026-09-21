import { calculateLoudnessGainDb } from "../uploads/audio-loudness.js";
import { TrackLicense, TrackOrigin } from "@prisma/client";
import { getTrackLicenseDefinition, normalizeTrackLicense } from "./licenses.js";

export const backgroundUsageAllowedByDefault = (license?: string | null) => {
  const normalized = normalizeTrackLicense(license);
  return (
    normalized === TrackLicense.CC0_1_0 ||
    normalized === TrackLicense.CC_BY_3_0 ||
    normalized === TrackLicense.CC_BY_4_0
  );
};

export const backgroundUsageAttributionAllowedByDefault = (
  license?: string | null,
) => {
  const normalized = normalizeTrackLicense(license);
  return normalized !== TrackLicense.CC0_1_0;
};

type RawCredit = {
  role?: string;
  userId?: number | string;
};

type RawLink = {
  label?: string;
  url?: string;
};

type RawSong = {
  name: string;
  slug: string;
  url: string;
  commentary?: string | null;
  bpm?: number | null;
  musicalKey?: string | null;
  integratedLufs?: number | null;
  truePeakDb?: number | null;
  loudnessGainDb?: number | null;
  softwareUsed?: unknown[];
  license?: string | null;
  origin?: TrackOrigin | "ORIGINAL" | "ASSET_PACK";
  externalAuthorName?: string | null;
  allowBackgroundUse?: boolean;
  allowBackgroundUseAttribution?: boolean;
  tagIds?: Array<number | string>;
  flagIds?: Array<number | string>;
  links?: RawLink[];
  credits?: RawCredit[];
  composerId?: number | null;
};

export function normalizeTrackCredits(credits: RawCredit[] | undefined) {
  return Array.isArray(credits)
    ? credits
        .map((credit) => ({
          role: String(credit?.role ?? "").trim(),
          userId: Number(credit?.userId),
        }))
        .filter(
          (credit) =>
            credit.role.length > 0 && Number.isInteger(credit.userId),
        )
    : [];
}

export function getPrimaryComposerId(
  normalizedCredits: ReturnType<typeof normalizeTrackCredits>,
  composerId?: number | null,
) {
  return (
    normalizedCredits.find(
      (credit) => credit.role.toLowerCase() === "composer",
    )?.userId ??
    normalizedCredits.find((credit) => Number.isInteger(credit.userId))
      ?.userId ??
    (typeof composerId === "number" && Number.isInteger(composerId)
      ? composerId
      : null)
  );
}

export function normalizeTrackLinks(links: RawLink[] | undefined) {
  return Array.isArray(links)
    ? links
        .map((link) => ({
          label: String(link?.label ?? "").trim(),
          url: String(link?.url ?? "").trim(),
        }))
        .filter((link) => link.label && link.url)
    : [];
}

export function normalizeTrackIdList(ids: Array<number | string> | undefined) {
  return Array.isArray(ids)
    ? ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id))
    : [];
}

export function buildTrackWriteData(song: RawSong) {
  const normalizedCredits = normalizeTrackCredits(song.credits);
  const composerId = getPrimaryComposerId(normalizedCredits, song.composerId);
  const normalizedLicense = normalizeTrackLicense(song.license);
  const origin = song.origin === TrackOrigin.ASSET_PACK ? TrackOrigin.ASSET_PACK : TrackOrigin.ORIGINAL;
  const externalAuthorName = song.externalAuthorName?.trim() || null;
  const licenseRequiresBackgroundUse = backgroundUsageAllowedByDefault(normalizedLicense);
  const allowBackgroundUse =
    origin === TrackOrigin.ASSET_PACK || licenseRequiresBackgroundUse
      ? licenseRequiresBackgroundUse
      : typeof song.allowBackgroundUse === "boolean"
        ? song.allowBackgroundUse
        : false;
  const allowBackgroundUseAttribution =
    allowBackgroundUse && backgroundUsageAttributionAllowedByDefault(normalizedLicense)
      ? origin === TrackOrigin.ASSET_PACK || licenseRequiresBackgroundUse
        ? true
        : (song.allowBackgroundUseAttribution ?? true)
      : false;
  const integratedLufs =
    typeof song.integratedLufs === "number" && Number.isFinite(song.integratedLufs)
      ? song.integratedLufs
      : null;
  const truePeakDb =
    typeof song.truePeakDb === "number" && Number.isFinite(song.truePeakDb)
      ? song.truePeakDb
      : null;

  return {
    name: String(song.name ?? "").trim(),
    slug: String(song.slug ?? "").trim(),
    url: String(song.url ?? "").trim(),
    commentary: song.commentary || null,
    bpm:
      typeof song.bpm === "number" && Number.isFinite(song.bpm)
        ? Math.max(1, Math.floor(song.bpm))
        : null,
    musicalKey: song.musicalKey?.trim() || null,
    integratedLufs,
    truePeakDb,
    loudnessGainDb:
      integratedLufs != null && truePeakDb != null
        ? calculateLoudnessGainDb(integratedLufs, truePeakDb)
        : null,
    softwareUsed: Array.isArray(song.softwareUsed)
      ? song.softwareUsed.map((value) => String(value).trim()).filter(Boolean)
      : [],
    license: normalizedLicense,
    origin,
    externalAuthorName,
    allowDownload: getTrackLicenseDefinition(normalizedLicense).allowDownload,
    allowBackgroundUse,
    allowBackgroundUseAttribution,
    composerId: origin === TrackOrigin.ASSET_PACK ? null : composerId,
    tagIds: normalizeTrackIdList(song.tagIds),
    flagIds: normalizeTrackIdList(song.flagIds),
    links: normalizeTrackLinks(song.links),
    credits: origin === TrackOrigin.ASSET_PACK ? [] : normalizedCredits,
  };
}
