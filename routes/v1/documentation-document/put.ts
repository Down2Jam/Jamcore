import { Router } from "express";
import db from "@helper/db";
import { getAdminUserFromRequest } from "@helper/getAdminUserFromRequest";

const router = Router();
const documentationDocument = (db as any).documentationDocument;

router.put("/", async function (req, res) {
  const { documentId, username, title, content, icon, order } = req.body;
  const id = Number(documentId);

  if (
    !Number.isInteger(id) ||
    typeof username !== "string" ||
    (title == null && content == null && icon == null && order == null)
  ) {
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

  const data: {
    title?: string;
    content?: string;
    icon?: string;
    order?: number;
    editedAt?: Date;
  } = {};
  let edited = false;

  if (typeof title === "string" && title.trim()) {
    data.title = title.trim();
    edited = edited || title.trim() !== existingDocument.title;
  }

  if (typeof content === "string" && content.trim()) {
    data.content = content;
    edited = edited || content !== existingDocument.content;
  }

  if (typeof icon === "string" && icon.trim()) {
    data.icon = icon.trim();
    edited = edited || icon.trim() !== existingDocument.icon;
  }

  if (Number.isInteger(order)) {
    data.order = Number(order);
  }

  if (edited) {
    data.editedAt = new Date();
  }

  const updatedDocument = await documentationDocument.update({
    where: {
      id,
    },
    data,
    include: {
      author: {
        select: {
          id: true,
          slug: true,
          name: true,
          profilePicture: true,
        },
      },
    },
  });

  res.json({ data: updatedDocument });
});

export default router;
