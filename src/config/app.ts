import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { env } from "./env.js";

const appConfigSchema = z.object({
  appName: z.string(),
  publicOrigin: z.string().url(),
  mentionDomains: z.array(z.string()),
  api: z.object({
    currentVersion: z.string(),
    supportedVersions: z.array(z.string()),
    deprecationPolicy: z.string(),
    limits: z.object({
      jsonBody: z.string(),
      mutationBody: z.string(),
      uploadImageBytes: z.number().int().positive(),
      uploadMusicBytes: z.number().int().positive(),
    }),
  }),
  platform: z.object({
    auditLogPath: z.string(),
    webhookLogPath: z.string(),
    deadLetterLogPath: z.string(),
    serviceKeysPath: z.string(),
    idempotency: z.object({
      enabled: z.boolean(),
      path: z.string(),
      ttlMs: z.number().int().positive(),
    }),
    jobs: z.object({
      path: z.string(),
      pollIntervalMs: z.number().int().positive(),
      retryDelaysMs: z.array(z.number().int().nonnegative()),
      maxRetainedJobs: z.number().int().positive(),
    }),
    precompute: z.object({
      enabled: z.boolean(),
      intervalMs: z.number().int().positive(),
      sorts: z.array(z.string()),
    }),
    multiTenant: z.object({
      defaultTenantId: z.string(),
      strictIsolation: z.boolean(),
      tenants: z.array(
        z.object({
          id: z.string(),
          hosts: z.array(z.string()),
          appName: z.string().optional(),
          publicOrigin: z.string().url().optional(),
          mentionDomains: z.array(z.string()).optional(),
        }),
      ),
    }),
    webhooks: z.object({
      enabled: z.boolean(),
      timeoutMs: z.number().int().positive(),
      endpoints: z.array(
        z.object({
          id: z.string(),
          url: z.string().url(),
          events: z.array(z.string()),
          secret: z.string().optional(),
          headers: z.record(z.string(), z.string()).optional(),
        }),
      ),
    }),
  }),
  uploads: z.object({
    apiBasePath: z.string(),
    staticImagesPath: z.string(),
    imageRoute: z.string(),
    profileImageRoute: z.string(),
    musicRoute: z.string(),
  }),
  games: z.object({
    categories: z.object({
      regular: z.string(),
      extra: z.string(),
      oda: z.string(),
    }),
    ratingCategoryNames: z.object({
      overall: z.string(),
      overallTrack: z.string(),
    }),
  }),
  jam: z.object({
    phases: z.object({
      suggestion: z.string(),
      elimination: z.string(),
      voting: z.string(),
      jamming: z.string(),
      submission: z.string(),
      rating: z.string(),
      postJamRefinement: z.string(),
      postJamRating: z.string(),
      upcoming: z.string(),
      inactive: z.string(),
    }),
  }),
  federation: z.object({
    enabled: z.boolean(),
    jamActor: z.object({
      username: z.string(),
      name: z.string(),
      summary: z.string(),
    }),
    nodeInfo: z.object({
      softwareName: z.string(),
      softwareVersion: z.string(),
      protocols: z.array(z.string()),
      openRegistrations: z.boolean(),
    }),
    delivery: z.object({
      enabled: z.boolean(),
      userAgent: z.string(),
      timeoutMs: z.number().int().positive(),
      retryDelaysMs: z.array(z.number().int().nonnegative()),
    }),
    security: z.object({
      enabled: z.boolean(),
      requireHttpSignatures: z.boolean(),
      maxClockSkewSeconds: z.number().int().positive(),
      privateKeyPath: z.string(),
      publicKeyPath: z.string(),
    }),
    state: z.object({
      enabled: z.boolean(),
      provider: z.enum(["file"]),
      path: z.string(),
      maxDeliveries: z.number().int().positive(),
      maxRemoteActors: z.number().int().positive(),
    }),
  }),
  users: z.object({
    defaultPrefixSeed: z.string(),
  }),
  featuredStreamers: z.object({
    gameIds: z.array(z.string()),
    priorityTags: z.array(z.string()),
    desiredTags: z.array(z.string()),
    tagSynonyms: z.object({}).catchall(z.string()),
  }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

const resolvedPublicOrigin =
  typeof env.clientOrigin === "string" && env.clientOrigin.length > 0
    ? env.clientOrigin
    : "https://d2jam.com";

const defaultConfig: AppConfig = {
  appName: "Jamcore",
  publicOrigin: resolvedPublicOrigin,
  mentionDomains: [getHostname(resolvedPublicOrigin), "localhost", "127.0.0.1"],
  api: {
    currentVersion: "v1",
    supportedVersions: ["v1"],
    deprecationPolicy:
      "Additive changes only within a version. Breaking changes require a new version and deprecation window.",
    limits: {
      jsonBody: "1mb",
      mutationBody: "256kb",
      uploadImageBytes: 8 * 1024 * 1024,
      uploadMusicBytes: 16 * 1024 * 1024,
    },
  },
  platform: {
    auditLogPath: "logs/audit.log",
    webhookLogPath: ".jamcore/webhook-deliveries.log",
    deadLetterLogPath: ".jamcore/dead-letter.log",
    serviceKeysPath: ".jamcore/service-keys.json",
    idempotency: {
      enabled: true,
      path: ".jamcore/idempotency-records.json",
      ttlMs: 24 * 60 * 60 * 1000,
    },
    jobs: {
      path: ".jamcore/jobs.json",
      pollIntervalMs: 2_000,
      retryDelaysMs: [5_000, 15_000, 60_000],
      maxRetainedJobs: 1_000,
    },
    precompute: {
      enabled: true,
      intervalMs: 5 * 60 * 1000,
      sorts: ["score", "danger", "karma", "recommended", "leastrated"],
    },
    multiTenant: {
      defaultTenantId: "default",
      strictIsolation: false,
      tenants: [
        {
          id: "default",
          hosts: [getHostname(resolvedPublicOrigin), "localhost", "127.0.0.1"],
          appName: "Jamcore",
          publicOrigin: resolvedPublicOrigin,
          mentionDomains: [
            getHostname(resolvedPublicOrigin),
            "localhost",
            "127.0.0.1",
          ],
        },
      ],
    },
    webhooks: {
      enabled: false,
      timeoutMs: 10_000,
      endpoints: [],
    },
  },
  uploads: {
    apiBasePath: "/api/v1",
    staticImagesPath: "/images",
    imageRoute: "image",
    profileImageRoute: "pfp",
    musicRoute: "music",
  },
  games: {
    categories: {
      regular: "REGULAR",
      extra: "EXTRA",
      oda: "ODA",
    },
    ratingCategoryNames: {
      overall: "RatingCategory.Overall.Title",
      overallTrack: "Overall",
    },
  },
  jam: {
    phases: {
      suggestion: "Suggestion",
      elimination: "Elimination",
      voting: "Voting",
      jamming: "Jamming",
      submission: "Submission",
      rating: "Rating",
      postJamRefinement: "Post-Jam Refinement",
      postJamRating: "Post-Jam Rating",
      upcoming: "Upcoming Jam",
      inactive: "No Active Jams",
    },
  },
  federation: {
    enabled: false,
    jamActor: {
      username: "jam",
      name: "Jam",
      summary:
        "The main jam community actor for forum discussions, announcements, editions, games, and music.",
    },
    nodeInfo: {
      softwareName: "jamcore",
      softwareVersion: "1.0.0",
      protocols: ["activitypub"],
      openRegistrations: false,
    },
    delivery: {
      enabled: false,
      userAgent: "jamcore-federation/1.0",
      timeoutMs: 10_000,
      retryDelaysMs: [1_000, 5_000, 30_000],
    },
    security: {
      enabled: false,
      requireHttpSignatures: true,
      maxClockSkewSeconds: 300,
      privateKeyPath: ".jamcore/federation-private.pem",
      publicKeyPath: ".jamcore/federation-public.pem",
    },
    state: {
      enabled: false,
      provider: "file",
      path: ".jamcore/federation-state.json",
      maxDeliveries: 500,
      maxRemoteActors: 500,
    },
  },
  users: {
    defaultPrefixSeed: "jamjar",
  },
  featuredStreamers: {
    gameIds: ["1469308723", "509660", "66082", "1599346425"],
    priorityTags: ["d2jam", "down2jam"],
    desiredTags: ["d2jam", "down2jam", "gamejam", "gamedev"],
    tagSynonyms: {
      gamedevelopment: "gamedev",
      ue5: "unrealengine",
      godotengine: "godot",
      unity3d: "unity",
      down2jam: "d2jam",
    },
  },
};

function getHostname(origin: string) {
  try {
    return new URL(origin).hostname;
  } catch {
    return "d2jam.com";
  }
}

function loadConfigOverride() {
  const configuredPath = env.appConfigPath
    ? path.resolve(process.cwd(), env.appConfigPath)
    : path.resolve(process.cwd(), "app.config.json");

  if (!fs.existsSync(configuredPath)) {
    return {};
  }

  const raw = JSON.parse(fs.readFileSync(configuredPath, "utf8"));
  return raw as Partial<AppConfig>;
}

function mergeConfig(
  base: AppConfig,
  override: Partial<AppConfig>,
): AppConfig {
  return {
    ...base,
    ...override,
    uploads: {
      ...base.uploads,
      ...override.uploads,
    },
    api: {
      ...base.api,
      ...override.api,
      limits: {
        ...base.api.limits,
        ...override.api?.limits,
      },
      supportedVersions:
        override.api?.supportedVersions ?? base.api.supportedVersions,
    },
    platform: {
      ...base.platform,
      ...override.platform,
      idempotency: {
        ...base.platform.idempotency,
        ...override.platform?.idempotency,
      },
      jobs: {
        ...base.platform.jobs,
        ...override.platform?.jobs,
        retryDelaysMs:
          override.platform?.jobs?.retryDelaysMs ??
          base.platform.jobs.retryDelaysMs,
      },
      precompute: {
        ...base.platform.precompute,
        ...override.platform?.precompute,
        sorts:
          override.platform?.precompute?.sorts ??
          base.platform.precompute.sorts,
      },
      multiTenant: {
        ...base.platform.multiTenant,
        ...override.platform?.multiTenant,
        tenants:
          override.platform?.multiTenant?.tenants ??
          base.platform.multiTenant.tenants,
      },
      webhooks: {
        ...base.platform.webhooks,
        ...override.platform?.webhooks,
        endpoints:
          override.platform?.webhooks?.endpoints ??
          base.platform.webhooks.endpoints,
      },
    },
    games: {
      ...base.games,
      ...override.games,
      categories: {
        ...base.games.categories,
        ...override.games?.categories,
      },
      ratingCategoryNames: {
        ...base.games.ratingCategoryNames,
        ...override.games?.ratingCategoryNames,
      },
    },
    jam: {
      ...base.jam,
      ...override.jam,
      phases: {
        ...base.jam.phases,
        ...override.jam?.phases,
      },
    },
    federation: {
      ...base.federation,
      ...override.federation,
      jamActor: {
        ...base.federation.jamActor,
        ...override.federation?.jamActor,
      },
      nodeInfo: {
        ...base.federation.nodeInfo,
        ...override.federation?.nodeInfo,
        protocols:
          override.federation?.nodeInfo?.protocols ??
          base.federation.nodeInfo.protocols,
      },
      delivery: {
        ...base.federation.delivery,
        ...override.federation?.delivery,
        retryDelaysMs:
          override.federation?.delivery?.retryDelaysMs ??
          base.federation.delivery.retryDelaysMs,
      },
      security: {
        ...base.federation.security,
        ...override.federation?.security,
      },
      state: {
        ...base.federation.state,
        ...override.federation?.state,
      },
    },
    users: {
      ...base.users,
      ...override.users,
    },
    featuredStreamers: {
      ...base.featuredStreamers,
      ...override.featuredStreamers,
      gameIds: override.featuredStreamers?.gameIds ?? base.featuredStreamers.gameIds,
      priorityTags:
        override.featuredStreamers?.priorityTags ??
        base.featuredStreamers.priorityTags,
      desiredTags:
        override.featuredStreamers?.desiredTags ??
        base.featuredStreamers.desiredTags,
      tagSynonyms: {
        ...base.featuredStreamers.tagSynonyms,
        ...override.featuredStreamers?.tagSynonyms,
      },
    },
    mentionDomains: override.mentionDomains ?? base.mentionDomains,
  };
}

export const appConfig = appConfigSchema.parse(
  mergeConfig(defaultConfig, loadConfigOverride()),
);
