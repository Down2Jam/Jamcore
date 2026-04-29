import { z } from "zod";

export const deliveryStateSchema = z.object({
  id: z.string(),
  inbox: z.string().url(),
  activity: z.unknown(),
  attempts: z.number().int().nonnegative(),
  status: z.enum(["queued", "delivered", "failed"]),
  lastError: z.string().nullable(),
  activityType: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextAttemptAt: z.string().nullable(),
});

export const remoteActorStateSchema = z.object({
  actorId: z.string().url(),
  actor: z.object({
    id: z.string().url(),
    type: z.string(),
    preferredUsername: z.string().optional(),
    name: z.string().optional(),
    summary: z.string().optional(),
    inbox: z.string().url().optional(),
    outbox: z.string().url().optional(),
    url: z.union([z.string().url(), z.array(z.string().url())]).optional(),
    icon: z
      .object({
        url: z.string().url(),
      })
      .optional(),
    publicKey: z
      .object({
        id: z.string().url(),
        owner: z.string().url(),
        publicKeyPem: z.string(),
      })
      .optional(),
  }),
  expiresAt: z.number().int(),
  updatedAt: z.string(),
});

export const followerStateSchema = z.object({
  id: z.string(),
  actorId: z.string().url(),
  targetActorId: z.string().url(),
  inbox: z.string().url().nullable(),
  status: z.enum(["active", "undone"]),
  followedAt: z.string(),
  updatedAt: z.string(),
});

export const followingStateSchema = z.object({
  id: z.string(),
  actorId: z.string().url(),
  targetActorId: z.string().url(),
  targetInbox: z.string().url().nullable(),
  status: z.enum(["active", "undone"]),
  followedAt: z.string(),
  updatedAt: z.string(),
});

export const federationStateSchema = z.object({
  deliveries: z.array(deliveryStateSchema).default([]),
  remoteActors: z.array(remoteActorStateSchema).default([]),
  followers: z.array(followerStateSchema).default([]),
  following: z.array(followingStateSchema).default([]),
});

export type PersistedDeliveryState = z.infer<typeof deliveryStateSchema>;
export type PersistedRemoteActorState = z.infer<typeof remoteActorStateSchema>;
export type PersistedFollowerState = z.infer<typeof followerStateSchema>;
export type PersistedFollowingState = z.infer<typeof followingStateSchema>;
export type FederationState = z.infer<typeof federationStateSchema>;
