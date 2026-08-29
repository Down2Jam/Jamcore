import { z } from "zod";

import { assignCoreEntityTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { BadRequestError, ConflictError } from "../../lib/errors.js";
import { createTeam } from "../teams/index.js";
import { createGame } from "./creation.service.js";
import { importItchGameSchema } from "./write.schemas.js";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const ITCH_PLATFORM = "ITCH";

type ItchBuildPlatform =
  | "Web"
  | "Windows"
  | "MacOS"
  | "Linux"
  | "Mobile"
  | "Other";

const BUILD_PLATFORM_ORDER: ItchBuildPlatform[] = [
  "Web",
  "Windows",
  "MacOS",
  "Linux",
  "Mobile",
  "Other",
];

type ImportedPage = {
  url: string;
  title: string;
  description: string;
  createdAt: Date | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  screenshots: string[];
  trailerUrl: string | null;
  jamUrl: string | null;
  jams: Array<{ name: string; url: string }>;
  itchEmbedUrl: string | null;
  buildPlatforms: ItchBuildPlatform[];
};

function parseItchUtcDate(value: string) {
  let normalized = decodeHtml(value).replace(/\s*@\s*/, " ").trim();
  if (
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(normalized)
  ) {
    normalized += " UTC";
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findGameCreationDate(html: string) {
  const dates: Date[] = [];
  for (const match of html.matchAll(
    /<(?:div|span)\b(?=[^>]*\bclass=["'][^"']*\bversion_date\b[^"']*["'])[^>]*>[\s\S]*?<abbr\b[^>]*\btitle=["']([^"']+)["']/gi,
  )) {
    const date = parseItchUtcDate(match[1]);
    if (date) dates.push(date);
  }

  return dates.length > 0
    ? new Date(Math.min(...dates.map((date) => date.getTime())))
    : null;
}

function normalizeItchImageUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(decodeHtml(value), "https://itch.io");
    return parsed.protocol === "https:" && parsed.hostname === "img.itch.zone"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function findBannerUrl(html: string) {
  const headerImage = html.match(
    /<div\b(?=[^>]*\bid=["']header["'])[^>]*>[\s\S]*?<img\b[^>]*\bsrc=["']([^"']+)["']/i,
  )?.[1];
  return normalizeItchImageUrl(headerImage);
}

function findScreenshots(html: string) {
  const screenshotList = html.match(
    /<div\b(?=[^>]*\bclass=["'][^"']*\bscreenshot_list\b[^"']*["'])[^>]*>([\s\S]*?)<\/div>/i,
  )?.[1];
  if (!screenshotList) return [];

  const screenshots = new Set<string>();
  for (const match of screenshotList.matchAll(
    /<a\b(?=[^>]*\bdata-image_lightbox=["']true["'])[^>]*\bhref=["']([^"']+)["']/gi,
  )) {
    const url = normalizeItchImageUrl(match[1]);
    if (url) screenshots.add(url);
    if (screenshots.size === 5) break;
  }
  return Array.from(screenshots);
}

function findTrailerUrl(html: string) {
  const videoEmbed = html.match(
    /<div\b(?=[^>]*\bclass=["'][^"']*\bvideo_embed\b[^"']*["'])[^>]*>([\s\S]*?)<\/div>/i,
  )?.[1];
  if (!videoEmbed) return null;

  const youtubeId = decodeHtml(videoEmbed).match(
    /(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  )?.[1];
  return youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function readGameTitle(html: string) {
  const visibleTitle = html.match(
    /<(?:h1|h2)[^>]*class=["'][^"']*\bgame_title\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:h1|h2)>/i,
  )?.[1];
  if (visibleTitle) return stripHtml(visibleTitle);

  const socialTitle =
    readMeta(html, "og:title") ??
    stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");

  return socialTitle
    .replace(/\s+by\s+.+?(?:\s+-\s+itch\.io)?$/i, "")
    .replace(/\s+-\s+itch\.io$/i, "")
    .trim();
}

function readMeta(html: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return null;
}

function normalizeItchUrl(value: string, kind: "game" | "jam") {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestError(`Invalid itch ${kind} URL.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.port ||
    (hostname !== "itch.io" && !hostname.endsWith(".itch.io"))
  ) {
    throw new BadRequestError(`URL must be a secure itch.io ${kind} page.`);
  }

  parsed.hash = "";
  if (kind === "jam" && !/^\/jam\/[^/]+\/?$/i.test(parsed.pathname)) {
    throw new BadRequestError("Jam URL must look like https://itch.io/jam/jam-name.");
  }
  if (kind === "game" && hostname === "itch.io") {
    throw new BadRequestError("Game URL must be an itch.io creator game page.");
  }
  return parsed.toString().replace(/\/$/, "");
}

async function fetchItchHtml(initialUrl: string) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; d2jam itch importer/1.0; +https://d2jam.com)",
        },
      });
    } catch {
      throw new BadRequestError("Could not load that itch.io page.");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new BadRequestError("The itch.io page redirected too many times.");
      }
      currentUrl = normalizeItchUrl(new URL(location, currentUrl).toString(), currentUrl.includes("/jam/") ? "jam" : "game");
      continue;
    }
    if (!response.ok) {
      throw new BadRequestError(`itch.io returned ${response.status} for that page.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new BadRequestError("The itch.io URL did not return a game page.");
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_HTML_BYTES) {
      throw new BadRequestError("The itch.io page is too large to import.");
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new BadRequestError("The itch.io page had no content.");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new BadRequestError("The itch.io page is too large to import.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { html: new TextDecoder().decode(bytes), finalUrl: currentUrl };
  }
  throw new BadRequestError("Could not load that itch.io page.");
}

function humanizeJamSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toCanonicalJamOptionUrl(value: string) {
  try {
    const parsed = new URL(decodeHtml(value), "https://itch.io");
    if (parsed.hostname.toLowerCase() !== "itch.io") return null;
    const match = parsed.pathname.match(/^\/jam\/([a-z0-9_-]+)/i);
    return match ? `https://itch.io/jam/${match[1]}` : null;
  } catch {
    return null;
  }
}

function findJams(html: string) {
  const jams = new Map<string, string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']*(?:\/jam\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const url = toCanonicalJamOptionUrl(match[1]);
    if (!url) continue;
    const slug = new URL(url).pathname.split("/").at(-1) ?? "jam";
    const rawName = stripHtml(match[2]).replace(/^Submission to\s+/i, "").trim();
    const name =
      !rawName || /^(?:view|rate)(?: the)? submission/i.test(rawName)
        ? humanizeJamSlug(slug)
        : rawName;
    if (!jams.has(url) || jams.get(url) === humanizeJamSlug(slug)) {
      jams.set(url, name);
    }
  }

  for (const match of html.matchAll(/https:\/\/itch\.io\/jam\/[a-z0-9_-]+/gi)) {
    const url = toCanonicalJamOptionUrl(match[0]);
    if (!url || jams.has(url)) continue;
    const slug = new URL(url).pathname.split("/").at(-1) ?? "jam";
    jams.set(url, humanizeJamSlug(slug));
  }

  return Array.from(jams, ([url, name]) => ({ name, url }));
}

function detectBuildPlatforms(html: string): ItchBuildPlatform[] {
  const detected = new Set<ItchBuildPlatform>();

  if (
    /\bview_html_game_page\b/i.test(html) ||
    /\bhtml_embed_widget\b/i.test(html) ||
    /["']type_name["']\s*:\s*["']html["']/i.test(html)
  ) {
    detected.add("Web");
  }

  for (const match of html.matchAll(/title=["']Download for ([^"']+)["']/gi)) {
    const platform = decodeHtml(match[1]).trim().toLowerCase();
    if (platform === "windows") detected.add("Windows");
    else if (platform === "macos" || platform === "mac os") detected.add("MacOS");
    else if (platform === "linux") detected.add("Linux");
    else if (platform === "android" || platform === "ios") detected.add("Mobile");
  }

  if (/\bicon-windows(?:8)?\b/i.test(html)) detected.add("Windows");
  if (/\bicon-(?:apple|macos)\b/i.test(html)) detected.add("MacOS");
  if (/\bicon-(?:tux|linux)\b/i.test(html)) detected.add("Linux");
  if (/\bicon-(?:android|ios)\b/i.test(html)) detected.add("Mobile");

  if (detected.size === 0) detected.add("Other");
  return BUILD_PLATFORM_ORDER.filter((platform) => detected.has(platform));
}

export function parseItchGameHtml(html: string, finalUrl: string): ImportedPage {
  const title = readGameTitle(html);
  if (!title) throw new BadRequestError("Could not find a game title on that itch.io page.");

  const description = readMeta(html, "og:description") ?? readMeta(html, "description") ?? "";
  const buildPlatforms = detectBuildPlatforms(html);
  const itchPathGameId = readMeta(html, "itch:path")?.match(/^games\/(\d+)$/i)?.[1];
  const embedId =
    html.match(
      /(?:https:\/\/itch\.io\/embed(?:-upload)?\/|data-game_id=["'])(\d+)/i,
    )?.[1] ?? itchPathGameId ?? null;
  const jams = findJams(html);
  return {
    url: finalUrl,
    title,
    description,
    createdAt: findGameCreationDate(html),
    imageUrl: readMeta(html, "og:image"),
    bannerUrl: findBannerUrl(html),
    screenshots: findScreenshots(html),
    trailerUrl: findTrailerUrl(html),
    jamUrl: jams[0]?.url ?? null,
    jams,
    itchEmbedUrl:
      embedId && buildPlatforms.includes("Web")
        ? `https://itch.io/embed/${embedId}`
        : null,
    buildPlatforms,
  };
}

export async function previewItchGame(
  input: z.infer<typeof importItchGameSchema>,
) {
  const requestedUrl = normalizeItchUrl(input.url, "game");
  const { html, finalUrl } = await fetchItchHtml(requestedUrl);
  return parseItchGameHtml(html, finalUrl);
}

async function findJamEndDate(jamUrl: string) {
  const { html } = await fetchItchHtml(normalizeItchUrl(jamUrl, "jam"));
  const endDate = html.match(/["']end_date["']\s*:\s*["']([^"']+)["']/i)?.[1];
  return endDate ? parseItchUtcDate(endDate) : null;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "itch-game";
}

async function uniqueGameSlug(base: string) {
  let slug = base;
  for (let suffix = 2; await db.game.findUnique({ where: { slug }, select: { id: true } }); suffix += 1) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}

async function resolveExternalJam(jamUrl: string, tenantId?: string) {
  const normalizedUrl = normalizeItchUrl(jamUrl, "jam");
  const existing = await db.jam.findUnique({ where: { sourceUrl: normalizedUrl } });
  if (existing) return existing;

  const { html } = await fetchItchHtml(normalizedUrl);
  const sourceSlug = new URL(normalizedUrl).pathname.split("/").filter(Boolean).at(-1) ?? "jam";
  const title = readMeta(html, "og:title") ?? stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? sourceSlug);
  let slug = `itch-${slugify(sourceSlug)}`;
  for (let suffix = 2; await db.jam.findUnique({ where: { slug }, select: { id: true } }); suffix += 1) {
    slug = `itch-${slugify(sourceSlug)}-${suffix}`;
  }

  const jam = await db.jam.create({
    data: {
      name: title.replace(/\s*-\s*itch\.io\s*$/i, "").trim(),
      slug,
      startTime: new Date(),
      isActive: false,
      sourceUrl: normalizedUrl,
      sourcePlatform: ITCH_PLATFORM,
    },
  });
  if (tenantId) {
    await assignCoreEntityTenant({ entityType: "Jam", entityId: jam.id, tenantId });
  }
  return jam;
}

export async function importItchGame({
  actorUser,
  input,
  tenantId,
}: {
  actorUser: { id: number; name: string; slug: string };
  input: z.infer<typeof importItchGameSchema>;
  tenantId?: string;
}) {
  const requestedUrl = normalizeItchUrl(input.url, "game");
  const duplicate = await db.game.findUnique({ where: { sourceUrl: requestedUrl }, select: { slug: true } });
  if (duplicate) throw new ConflictError(`That itch game is already listed as /g/${duplicate.slug}.`);

  const { html, finalUrl } = await fetchItchHtml(requestedUrl);
  const metadata = parseItchGameHtml(html, finalUrl);
  if (finalUrl !== requestedUrl) {
    const redirectedDuplicate = await db.game.findUnique({
      where: { sourceUrl: finalUrl },
      select: { slug: true },
    });
    if (redirectedDuplicate) {
      throw new ConflictError(
        `That itch game is already listed as /g/${redirectedDuplicate.slug}.`,
      );
    }
  }
  if (!input.jamUrl && metadata.jams.length > 1) {
    throw new BadRequestError(
      "This game belongs to multiple itch.io jams. Choose which jam to attach.",
    );
  }
  const jamUrl = input.jamUrl ? normalizeItchUrl(input.jamUrl, "jam") : metadata.jamUrl;
  if (!jamUrl) {
    throw new BadRequestError("No jam was found on the itch page. Add the itch.io jam page URL and try again.");
  }

  const sourceCreatedAt = metadata.createdAt ?? await findJamEndDate(jamUrl);
  const jam = await resolveExternalJam(jamUrl, tenantId);
  const team = await createTeam({ ownerId: actorUser.id, jamId: jam.id, tenantId });
  const sourceSlug = new URL(finalUrl).pathname.split("/").filter(Boolean).at(-1);
  const slug = await uniqueGameSlug(slugify(sourceSlug ?? metadata.title));

  return createGame({
    actorUser,
    jam,
    targetTeam: team,
    tenantId,
    sourceUrl: finalUrl,
    sourcePlatform: ITCH_PLATFORM,
    sourceCreatedAt,
    input: {
      name: metadata.title,
      slug,
      description: metadata.description,
      short: metadata.description.slice(0, 155),
      thumbnail: metadata.imageUrl,
      soundtrackThumbnail: null,
      banner: metadata.bannerUrl,
      downloadLinks: metadata.buildPlatforms.map((platform) => ({
        url: finalUrl,
        platform,
      })),
      category: "EXTERNAL",
      ratingCategories: [],
      majRatingCategories: [],
      published: true,
      themeJustification: "",
      achievements: [],
      flags: [],
      tags: [],
      leaderboards: [],
      songs: [],
      screenshots: metadata.screenshots,
      trailerUrl: metadata.trailerUrl,
      itchEmbedUrl: metadata.itchEmbedUrl,
      itchEmbedAspectRatio: metadata.itchEmbedUrl ? "16 / 9" : null,
      inputMethods: [],
      estOneRun: null,
      estAnyPercent: null,
      estHundredPercent: null,
      emotePrefix: null,
    },
  });
}
