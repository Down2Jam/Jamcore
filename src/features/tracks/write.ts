export const backgroundUsageAllowedByDefault = (license?: string | null) => {
  const normalized = (license ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  return normalized === "CC0" || normalized === "CC BY";
};

export const backgroundUsageAttributionAllowedByDefault = (
  license?: string | null,
) => {
  const normalized = (license ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  return normalized !== "CC0";
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
  softwareUsed?: unknown[];
  license?: string | null;
  allowDownload?: boolean;
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
  const normalizedLicense = song.license?.trim() || null;

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
    softwareUsed: Array.isArray(song.softwareUsed)
      ? song.softwareUsed.map((value) => String(value).trim()).filter(Boolean)
      : [],
    license: normalizedLicense,
    allowDownload: Boolean(song.allowDownload),
    allowBackgroundUse:
      typeof song.allowBackgroundUse === "boolean"
        ? song.allowBackgroundUse
        : backgroundUsageAllowedByDefault(normalizedLicense),
    allowBackgroundUseAttribution:
      typeof song.allowBackgroundUseAttribution === "boolean"
        ? song.allowBackgroundUseAttribution
        : backgroundUsageAttributionAllowedByDefault(normalizedLicense),
    composerId,
    tagIds: normalizeTrackIdList(song.tagIds),
    flagIds: normalizeTrackIdList(song.flagIds),
    links: normalizeTrackLinks(song.links),
    credits: normalizedCredits,
  };
}
