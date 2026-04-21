import { Router } from "express";
import db from "@helper/db";

const router = Router();
const pressKitMedia = (db as any).pressKitMedia;

router.get("/", async function (_req, res) {
  const media = await pressKitMedia.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  res.json({ data: media });
});

export default router;
