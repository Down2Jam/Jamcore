import { Router } from "express";
import db from "@helper/db";
import { getAdminUserFromRequest } from "@helper/getAdminUserFromRequest";

const router = Router();
const pressKitMedia = (db as any).pressKitMedia;

router.delete("/", async function (req, res) {
  const { mediaId, username } = req.body;
  const id = Number(mediaId);

  if (!Number.isInteger(id) || typeof username !== "string") {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const user = await getAdminUserFromRequest(req, res, username);
  if (!user) return;

  const existing = await pressKitMedia.findUnique({
    where: {
      id,
    },
  });

  if (!existing) {
    res.status(404).json({ message: "Media not found" });
    return;
  }

  await pressKitMedia.delete({
    where: {
      id,
    },
  });

  res.json({ message: "Media deleted" });
});

export default router;
