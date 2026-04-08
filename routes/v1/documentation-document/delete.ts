import { Router } from "express";
import db from "@helper/db";
import { getAdminUserFromRequest } from "@helper/getAdminUserFromRequest";

const router = Router();
const documentationDocument = (db as any).documentationDocument;

router.delete("/", async function (req, res) {
  const { documentId, username } = req.body;
  const id = Number(documentId);

  if (!Number.isInteger(id) || typeof username !== "string") {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const user = await getAdminUserFromRequest(req, res, username);
  if (!user) return;

  const existingDocument = await documentationDocument.findUnique({
    where: {
      id,
    },
  });

  if (!existingDocument) {
    res.status(404).json({ message: "Document not found" });
    return;
  }

  await documentationDocument.delete({
    where: {
      id,
    },
  });

  res.json({ message: "Document deleted" });
});

export default router;
