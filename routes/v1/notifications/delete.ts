import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import logger from "@helper/logger";

const router = express.Router();

router.delete("/:id", rateLimit(), authUser, getUser, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).send({ message: "Invalid notification id" });
    }

    const notification = await db.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).send({ message: "Notification not found" });
    }

    const user = res.locals.user;
    const isOwner = notification.recipientId === user.id;
    const isMod = user.role === "MOD" || user.role === "ADMIN";

    if (!isOwner && !isMod) {
      return res.status(403).send({ message: "Not allowed" });
    }

    await db.notification.delete({ where: { id } });
    logger.info(`Deleted notification with id ${id}`);

    res.status(200).send({ message: "Notification deleted" });
  } catch (error) {
    logger.error("Failed to delete notification: ", error);
    res.status(500).send({ message: "Failed to delete notification" });
  }
});

export default router;
