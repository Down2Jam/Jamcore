import express from "express";
import { z } from "zod";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { parseBody } from "../../../../lib/request.js";
import {
  createFederationAllowlistEntry,
  createFederationBlock,
  federationAllowlistSchema,
  federationBlockSchema,
  federationPreviewDecisionSchema,
  federationReputationSchema,
  federationTrustSettingsSchema,
  updateFederationPreviewDecision,
  updateFederationReputation,
  updateFederationTrustSettings,
} from "../../../../features/federation/admin.service.js";
import {
  moderateRemoteContent,
  remoteContentModerationSchema,
} from "../../../../features/federation/remote-content.service.js";

const router = express.Router();

router.post(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("federation:write"),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      mode?: unknown;
      allowType?: unknown;
      blockType?: unknown;
      trustLevel?: unknown;
      decision?: unknown;
      remoteContentKind?: unknown;
      id?: unknown;
    };
    const result =
      body.mode !== undefined
        ? await updateFederationTrustSettings({
            input: parseBody(req, federationTrustSettingsSchema),
            tenantId: res.locals.tenantId,
          })
        : body.allowType !== undefined
          ? await createFederationAllowlistEntry({
              input: parseBody(req, federationAllowlistSchema),
              tenantId: res.locals.tenantId,
              actorId: res.locals.user?.id ?? null,
            })
          : body.trustLevel !== undefined
            ? await updateFederationReputation({
                input: parseBody(req, federationReputationSchema),
                tenantId: res.locals.tenantId,
                actorId: res.locals.user?.id ?? null,
                })
            : body.remoteContentKind !== undefined
              ? await moderateRemoteContent({
                  input: parseBody(
                    req,
                    remoteContentModerationSchema.transform((value) => ({
                      ...value,
                      kind:
                        value.kind ??
                        z.enum(["feed_post", "comment"]).parse(body.remoteContentKind),
                    })),
                  ),
                  tenantId: res.locals.tenantId,
                  actorId: res.locals.user?.id ?? null,
                })
              : body.decision !== undefined || body.id !== undefined
                ? await updateFederationPreviewDecision({
                    input: parseBody(req, federationPreviewDecisionSchema),
                    tenantId: res.locals.tenantId,
                    actorId: res.locals.user?.id ?? null,
                  })
          : await createFederationBlock({
              input: parseBody(req, federationBlockSchema),
              tenantId: res.locals.tenantId,
              actorId: res.locals.user?.id ?? null,
            });
    res.status(201).json(result);
  }),
);

export default router;
