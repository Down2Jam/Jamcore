import express from "express";

import { appConfig } from "../config/app.js";

export const mutationBodyLimit = express.json({
  limit: appConfig.api.limits.mutationBody,
  type: [
    "application/json",
    "application/activity+json",
    'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
  ],
});
