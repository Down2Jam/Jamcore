export {};

import type {
  ServiceKeyIdentity,
  RequestUserLocals,
  TargetTeamContext,
  TargetUserContext,
} from "./locals.js";

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }

    interface Locals {
      requestId?: string;
      requestStartedAt?: number;
      serviceAuth?: ServiceKeyIdentity;
      tenantId?: string;
      tenant?: {
        id: string;
        appName: string;
        publicOrigin: string;
        mentionDomains: string[];
      };
      authorizationGrants?: Array<{
        id: string;
        subjectType: string;
        subjectId: string;
        role: string;
        tenantId: string | null;
        resourceType: string | null;
        resourceId: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
      authorizationGrantsContextKey?: string;
      userSlug?: string;
      user?: RequestUserLocals;
      targetUser?: TargetUserContext;
      jam?: Record<string, unknown> & { id?: number; startTime?: Date | string };
      nextJam?: Record<string, unknown>;
      jamPhase?: string;
      targetTeam?: TargetTeamContext;
      leaderboard?: Record<string, unknown>;
      pageLeaderboard?: Record<string, unknown>;
    }
  }
}
