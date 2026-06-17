import { PageVersion } from "@prisma/client";
import { z } from "zod";

import db from "../../infra/db.js";
import { recordSearchQuery } from "../../infra/metrics.js";
import {
  getSearchIndexStats,
  querySearchDocuments,
  type SearchDocumentRecord,
} from "../../infra/searchStore.js";
import { TTLCache } from "../../lib/cache.js";
import { ServiceUnavailableError } from "../../lib/errors.js";
import { materializeGamePage } from "../games/page.helpers.js";
import { materializeTrackPage } from "../tracks/page.js";
import { expandSearchTerms, getSearchTuning } from "./admin.service.js";
import { ensureSearchBootstrap } from "./readiness.js";
import { searchQuerySchema } from "./schemas.js";

type SearchFacetSummary = Record<string, number>;
type SearchDebugMatch = {
  documentId: string;
  entityType: string;
  entityId: number;
  score: number;
  title: string;
  variant: string | null;
};

type SearchContentResult = {
  message: string;
  meta: {
    limit: number;
    requestedTypes: string[];
    totalMatches: number;
    facets?: SearchFacetSummary;
    debug?: {
      expandedTerms: string[];
      matches: SearchDebugMatch[];
    };
  };
  data: Record<string, unknown[]>;
};

type SearchEntityType = "games" | "users" | "posts" | "tracks" | "teams";

const searchCache = new TTLCache<SearchContentResult>(15_000);

export function clearSearchCache() {
  searchCache.clear();
}

function getSearchTypes(type?: string) {
  return !type
    ? ["games", "users", "posts", "tracks", "teams"]
    : type.split("&");
}

function pickPreferredGameVersion(document: SearchDocumentRecord) {
  return document.metadata.pageVersion === PageVersion.POST_JAM
    ? PageVersion.POST_JAM
    : PageVersion.JAM;
}

function groupDocumentsByEntity(documents: SearchDocumentRecord[]) {
  const groups = new Map<string, SearchDocumentRecord[]>();
  for (const document of documents) {
    const key = `${document.entityType}:${document.entityId}`;
    const existing = groups.get(key) ?? [];
    existing.push(document);
    groups.set(key, existing);
  }
  return groups;
}

function dedupeDocuments(documents: SearchDocumentRecord[]) {
  const grouped = groupDocumentsByEntity(documents);
  return [...grouped.values()].map((group) =>
    [...group].sort(
      (a, b) =>
        Number((b.metadata.searchScore as number | undefined) ?? 0) -
        Number((a.metadata.searchScore as number | undefined) ?? 0),
    )[0],
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSnippet(
  document: SearchDocumentRecord,
  terms: string[],
  highlight = true,
) {
  const normalizedTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
  const source =
    [document.title, document.subtitle, document.body]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .trim() || document.title;

  const matchTerm = normalizedTerms.find((term) =>
    source.toLowerCase().includes(term.toLowerCase()),
  );
  if (!matchTerm) {
    return source.slice(0, 160);
  }

  const index = source.toLowerCase().indexOf(matchTerm.toLowerCase());
  const start = Math.max(0, index - 48);
  const end = Math.min(source.length, index + matchTerm.length + 96);
  let snippet = source.slice(start, end).trim();
  if (start > 0) {
    snippet = `...${snippet}`;
  }
  if (end < source.length) {
    snippet = `${snippet}...`;
  }

  if (!highlight) {
    return snippet;
  }

  let highlighted = snippet;
  for (const term of normalizedTerms.sort((a, b) => b.length - a.length)) {
    highlighted = highlighted.replace(
      new RegExp(escapeRegExp(term), "gi"),
      (value) => `<mark>${value}</mark>`,
    );
  }
  return highlighted;
}

function attachSearchPresentation<TItem extends Record<string, unknown>>(
  item: TItem,
  document: SearchDocumentRecord,
  options: {
    terms: string[];
    debug: boolean;
  },
) {
  const presented: Record<string, unknown> = {
    ...item,
    searchSnippet: buildSnippet(document, options.terms),
    searchHighlights: {
      title: buildSnippet(
        {
          ...document,
          subtitle: null,
          body: null,
        },
        options.terms,
      ),
    },
  };

  if (options.debug) {
    presented.searchDebug = {
      documentId: document.documentId,
      score: document.metadata.searchScore ?? null,
      variant: document.variant,
      title: document.title,
    };
  }

  return presented as TItem;
}

function buildFacetSummary(documents: SearchDocumentRecord[]) {
  return documents.reduce<SearchFacetSummary>((acc, document) => {
    const key =
      document.entityType === "game"
        ? "games"
        : document.entityType === "user"
          ? "users"
          : document.entityType === "post"
            ? "posts"
            : document.entityType === "track"
              ? "tracks"
              : "teams";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

async function hydrateGameResults(
  documents: SearchDocumentRecord[],
  options: { terms: string[]; debug: boolean },
) {
  const uniqueDocuments = dedupeDocuments(documents);
  const games = await db.game.findMany({
    where: {
      id: {
        in: uniqueDocuments.map((document) => document.entityId),
      },
      published: true,
    },
    include: {
      pages: {
        where: {
          version: {
            in: [PageVersion.JAM, PageVersion.POST_JAM],
          },
        },
        select: {
          version: true,
          name: true,
          short: true,
          thumbnail: true,
          description: true,
          themeJustification: true,
        },
      },
    },
  });

  const gameById = new Map(games.map((game) => [game.id, game]));
  return uniqueDocuments
    .map((document) => {
      const game = gameById.get(document.entityId);
      if (!game) {
        return null;
      }

      const materializedGame = materializeGamePage(
        game,
        pickPreferredGameVersion(document),
      );
      return attachSearchPresentation({
        ...materializedGame,
        name: (materializedGame as { name?: string | null }).name ?? null,
      }, document, options);
    })
    .filter((value): value is NonNullable<typeof value> => value != null);
}

async function hydrateUserResults(
  documents: SearchDocumentRecord[],
  options: { terms: string[]; debug: boolean },
) {
  const users = await db.user.findMany({
    where: {
      id: {
        in: dedupeDocuments(documents).map((document) => document.entityId),
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      bannerPicture: true,
      profilePicture: true,
      short: true,
    },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  return dedupeDocuments(documents)
    .map((document) => {
      const user = userById.get(document.entityId);
      return user ? attachSearchPresentation(user, document, options) : null;
    })
    .filter((value): value is NonNullable<typeof value> => value != null);
}

async function hydratePostResults(
  documents: SearchDocumentRecord[],
  options: { terms: string[]; debug: boolean },
) {
  const posts = await db.post.findMany({
    where: {
      id: {
        in: dedupeDocuments(documents).map((document) => document.entityId),
      },
      deletedAt: null,
      removedAt: null,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      updatedAt: true,
    },
  });
  const postById = new Map(posts.map((post) => [post.id, post]));
  return dedupeDocuments(documents)
    .map((document) => {
      const post = postById.get(document.entityId);
      return post ? attachSearchPresentation(post, document, options) : null;
    })
    .filter((value): value is NonNullable<typeof value> => value != null);
}

async function hydrateTrackResults(
  documents: SearchDocumentRecord[],
  options: { terms: string[]; debug: boolean },
) {
  const tracks = await db.gamePageTrack.findMany({
    where: {
      id: {
        in: dedupeDocuments(documents).map((document) => document.entityId),
      },
    },
    include: {
      composer: {
        select: {
          id: true,
          name: true,
          slug: true,
          profilePicture: true,
          bannerPicture: true,
        },
      },
      gamePage: {
        select: {
          version: true,
          gameId: true,
          name: true,
          short: true,
          thumbnail: true,
          game: {
            select: {
              id: true,
              slug: true,
              pages: {
                where: {
                  version: {
                    in: [PageVersion.JAM, PageVersion.POST_JAM],
                  },
                },
                select: {
                  version: true,
                  name: true,
                  short: true,
                  thumbnail: true,
                },
              },
            },
          },
        },
      },
      tags: {
        include: {
          category: true,
        },
      },
      flags: true,
      links: true,
      credits: {
        include: {
          user: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const trackById = new Map(tracks.map((track) => [track.id, track]));
  return dedupeDocuments(documents)
    .map((document) => {
      const track = trackById.get(document.entityId);
      return track
        ? attachSearchPresentation(materializeTrackPage(track), document, options)
        : null;
    })
    .filter((value): value is NonNullable<typeof value> => value != null);
}

async function hydrateTeamResults(
  documents: SearchDocumentRecord[],
  options: { terms: string[]; debug: boolean },
) {
  const teams = await db.team.findMany({
    where: {
      id: {
        in: dedupeDocuments(documents).map((document) => document.entityId),
      },
    },
    select: {
      id: true,
      name: true,
    },
  });
  const teamById = new Map(teams.map((team) => [team.id, team]));
  return dedupeDocuments(documents)
    .map((document) => {
      const team = teamById.get(document.entityId);
      return team ? attachSearchPresentation(team, document, options) : null;
    })
    .filter((value): value is NonNullable<typeof value> => value != null);
}

async function hydrateResultsByType(
  type: SearchEntityType,
  documents: SearchDocumentRecord[],
  options: { terms: string[]; debug: boolean },
) {
  switch (type) {
    case "games":
      return hydrateGameResults(documents, options);
    case "users":
      return hydrateUserResults(documents, options);
    case "posts":
      return hydratePostResults(documents, options);
    case "tracks":
      return hydrateTrackResults(documents, options);
    case "teams":
      return hydrateTeamResults(documents, options);
    default:
      return [];
  }
}

function mapRequestedTypesToEntityTypes(types: string[]) {
  return types.flatMap((type) => {
    switch (type) {
      case "games":
        return ["game"] as const;
      case "users":
        return ["user"] as const;
      case "posts":
        return ["post"] as const;
      case "tracks":
        return ["track"] as const;
      case "teams":
        return ["team"] as const;
      default:
        return [];
    }
  });
}

function filterDocumentsForRequestedType(
  documents: SearchDocumentRecord[],
  type: SearchEntityType,
) {
  const entityType =
    type === "games"
      ? "game"
      : type === "users"
        ? "user"
        : type === "posts"
          ? "post"
          : type === "tracks"
            ? "track"
            : "team";

  return documents.filter((document) => document.entityType === entityType);
}

export async function searchContent({
  query,
  type,
  limit = 2,
  debug,
  includeFacets,
  tenantId,
}: z.infer<typeof searchQuerySchema> & {
  tenantId?: string | null;
}): Promise<SearchContentResult> {
  const normalizedLimit = Math.min(Math.max(limit, 1), 10);
  const cacheKey = JSON.stringify({
      query,
      type,
      limit: normalizedLimit,
      debug: debug === "true",
      includeFacets: includeFacets === "true",
      tenantId: tenantId ?? null,
    });

  return searchCache.getOrSet(cacheKey, async () => {
    const startedAt = Date.now();
    const searchTypes = getSearchTypes(type) as SearchEntityType[];
    const [expandedTerms, tuning] = await Promise.all([
      expandSearchTerms(query, tenantId),
      getSearchTuning(tenantId),
    ]);
    const indexStats = await getSearchIndexStats(tenantId);
    if (indexStats.documentCount === 0) {
      await ensureSearchBootstrap(tenantId);
      throw new ServiceUnavailableError(
        "Search index is building. Try again shortly.",
        {
          reason: "search-index-not-ready",
        },
        "ERR_SEARCH_INDEX_NOT_READY",
      );
    }
    const matchedDocuments = await querySearchDocuments({
      tenantId,
      entityTypes: mapRequestedTypesToEntityTypes(searchTypes),
      query,
      terms: expandedTerms,
      limit: normalizedLimit * Math.max(searchTypes.length, 1) * 3,
      exactMatchBoost: tuning.exactMatchBoost,
      prefixMatchBoost: tuning.prefixMatchBoost,
      substringMatchBoost: tuning.substringMatchBoost,
      fuzzyThreshold:
        query.trim().length <= 2
          ? Math.max(tuning.fuzzyThreshold, 0.25)
          : tuning.fuzzyThreshold,
      freshnessHalfLifeHours: tuning.freshnessHalfLifeHours,
      entityTypeWeights: {
        game: tuning.gameWeight,
        track: tuning.trackWeight,
        post: tuning.postWeight,
        user: tuning.userWeight,
        team: tuning.teamWeight,
      },
    }).then((documents) =>
      documents.map((document) => ({
        ...document,
        metadata: {
          ...document.metadata,
          searchScore: document.score,
        },
      })),
    );

    const data = Object.fromEntries(
      await Promise.all(
        searchTypes.map(async (requestedType) => {
          const documents = filterDocumentsForRequestedType(
            matchedDocuments,
            requestedType,
          ).slice(0, normalizedLimit * 2);
          const hydrated = await hydrateResultsByType(requestedType, documents, {
            terms: expandedTerms,
            debug: debug === "true",
          });
          return [requestedType, hydrated.slice(0, normalizedLimit)] as const;
        }),
      ),
    ) as Record<string, unknown[]>;

    recordSearchQuery({
      queryType: searchTypes.join("&"),
      durationMs: Date.now() - startedAt,
      resultCount: Object.values(data).reduce(
        (sum, items) => sum + items.length,
        0,
      ),
    });

    return {
      message: "Data searched",
      meta: {
        limit: normalizedLimit,
        requestedTypes: searchTypes,
        totalMatches: matchedDocuments.length,
        facets:
          includeFacets === "true" ? buildFacetSummary(matchedDocuments) : undefined,
        debug:
          debug === "true"
            ? {
                expandedTerms,
                matches: matchedDocuments.slice(0, 25).map((document) => ({
                  documentId: document.documentId,
                  entityType: document.entityType,
                  entityId: document.entityId,
                  score: Number(document.metadata.searchScore ?? 0),
                  title: document.title,
                  variant: document.variant,
                })),
              }
            : undefined,
      },
      data,
    };
  });
}

export { searchQuerySchema } from "./schemas.js";
