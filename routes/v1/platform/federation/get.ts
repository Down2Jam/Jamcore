import express from "express";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import {
  getFederationTrustSettings,
  listFederationAllowlist,
  listFederationBlocks,
  listFederationPreviewQueue,
  listFederationReputation,
} from "../../../../features/federation/admin.service.js";
import { listRemoteContentForModeration } from "../../../../features/federation/remote-content.service.js";
import { listFederationDeliveryRecords } from "../../../../features/federation/transport/delivery.service.js";

const router = express.Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("federation:read"),
  asyncHandler(async (_req, res) => {
    res.json({
      trust: await getFederationTrustSettings(res.locals.tenantId),
      allowlist: await listFederationAllowlist(res.locals.tenantId),
      blocks: await listFederationBlocks(res.locals.tenantId),
      reputation: await listFederationReputation(res.locals.tenantId),
      previewQueue: await listFederationPreviewQueue(res.locals.tenantId),
      remoteContent: await listRemoteContentForModeration({
        tenantId: res.locals.tenantId,
      }),
      deliveries: listFederationDeliveryRecords(100),
    });
  }),
);

export default router;
