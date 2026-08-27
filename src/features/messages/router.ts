import express from "express";

import getUser from "../../loaders/getUser.js";
import authUser from "../../middleware/authUser.js";
import rateLimit from "../../middleware/rateLimit.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRequestUser } from "../../lib/locals.js";
import { parseBody, parseParams, parseQuery } from "../../lib/request.js";
import {
  conversationActionSchema,
  conversationIdSchema,
  createConversation,
  createConversationSchema,
  getConversationMessages,
  getMessageCounts,
  listConversations,
  listConversationsSchema,
  listMessagesSchema,
  sendMessage,
  sendMessageSchema,
  updateConversation,
} from "./service.js";

export function createMessagesRouter() {
  const router = express.Router();
  router.use(authUser, getUser);

  router.get("/counts", rateLimit(), asyncHandler(async (_req, res) => {
    res.json(await getMessageCounts(requireRequestUser(res)));
  }));

  router.get("/conversations", rateLimit(), asyncHandler(async (req, res) => {
    res.json(await listConversations({
      actor: requireRequestUser(res),
      input: parseQuery(req, listConversationsSchema),
    }));
  }));

  router.post("/conversations", rateLimit(10), asyncHandler(async (req, res) => {
    const result = await createConversation({
      actor: requireRequestUser(res),
      input: parseBody(req, createConversationSchema),
      tenantId: res.locals.tenantId,
    });
    res.status(201).json(result);
  }));

  router.get("/conversations/:id/messages", rateLimit(), asyncHandler(async (req, res) => {
    const { id } = parseParams(req, conversationIdSchema);
    res.json(await getConversationMessages({
      actor: requireRequestUser(res),
      conversationId: id,
      input: parseQuery(req, listMessagesSchema),
    }));
  }));

  router.post("/conversations/:id/messages", rateLimit(30), asyncHandler(async (req, res) => {
    const { id } = parseParams(req, conversationIdSchema);
    const message = await sendMessage({
      actor: requireRequestUser(res),
      conversationId: id,
      input: parseBody(req, sendMessageSchema),
    });
    res.status(201).json(message);
  }));

  router.put("/conversations/:id", rateLimit(30), asyncHandler(async (req, res) => {
    const { id } = parseParams(req, conversationIdSchema);
    const { action } = parseBody(req, conversationActionSchema);
    res.json(await updateConversation({
      actor: requireRequestUser(res),
      conversationId: id,
      action,
    }));
  }));

  return router;
}
