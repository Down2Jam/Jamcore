import { z } from "zod";

import db from "../../infra/db.js";
import { NotFoundError } from "../../lib/errors.js";

const documentAuthorInclude = {
  author: {
    select: {
      id: true,
      slug: true,
      name: true,
      profilePicture: true,
    },
  },
} as const;

export const documentationSectionSchema = z.enum(["DOCS", "PRESS_KIT"]);

export const getDocumentationDocumentQuerySchema = z.object({
  slug: z.string().trim().min(1),
  section: documentationSectionSchema.optional(),
});

export const listDocumentationDocumentsQuerySchema = z.object({
  section: documentationSectionSchema,
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const createDocumentationDocumentSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  section: z.enum(["DOCS", "PRESS_KIT"]),
  icon: z.string().trim().optional(),
});

export const updateDocumentationDocumentSchema = z
  .object({
    documentId: z.coerce.number().int().positive(),
    title: z.string().trim().optional(),
    content: z.string().trim().optional(),
    icon: z.string().trim().optional(),
    order: z.coerce.number().int().optional(),
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.content !== undefined ||
      payload.icon !== undefined ||
      payload.order !== undefined,
    {
      message: "Invalid request body",
    },
  );

export const deleteDocumentationDocumentSchema = z.object({
  documentId: z.coerce.number().int().positive(),
});

export const createPressKitMediaSchema = z.object({
  image: z.string().trim().min(1),
  altText: z.string().trim().optional(),
});

export const deletePressKitMediaSchema = z.object({
  mediaId: z.coerce.number().int().positive(),
});

async function buildUniqueDocumentSlug(title: string) {
  const slugBase = slugify(title.trim());
  let slug = slugBase;
  let count = 1;

  while (true) {
    const existingDocument = await db.documentationDocument.findUnique({
      where: { slug },
    });

    if (!existingDocument) {
      return slug;
    }

    count += 1;
    slug = `${slugBase}-${count}`;
  }
}

export async function createDocumentationDocument({
  title,
  content,
  section,
  icon,
  authorId,
}: z.infer<typeof createDocumentationDocumentSchema> & {
  authorId: number;
}) {
  const lastDocument = await db.documentationDocument.findFirst({
    where: {
      section,
    },
    orderBy: [{ order: "desc" }, { id: "desc" }],
  });

  const slug = await buildUniqueDocumentSlug(title);

  return db.documentationDocument.create({
    data: {
      title: title.trim(),
      slug,
      content,
      icon: icon?.trim() ? icon.trim() : "book",
      order: (lastDocument?.order ?? -1) + 1,
      section,
      authorId,
    },
    include: documentAuthorInclude,
  });
}

export async function updateDocumentationDocument({
  documentId,
  title,
  content,
  icon,
  order,
}: z.infer<typeof updateDocumentationDocumentSchema>) {
  const existingDocument = await db.documentationDocument.findUnique({
    where: {
      id: documentId,
    },
  });

  if (!existingDocument) {
    throw new NotFoundError("Document not found");
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

  if (typeof order === "number" && Number.isInteger(order)) {
    data.order = order;
  }

  if (edited) {
    data.editedAt = new Date();
  }

  return db.documentationDocument.update({
    where: {
      id: documentId,
    },
    data,
    include: documentAuthorInclude,
  });
}

export async function deleteDocumentationDocument(documentId: number) {
  const existingDocument = await db.documentationDocument.findUnique({
    where: {
      id: documentId,
    },
  });

  if (!existingDocument) {
    throw new NotFoundError("Document not found");
  }

  await db.documentationDocument.delete({
    where: {
      id: documentId,
    },
  });
}

export async function getDocumentationDocumentBySlug({
  slug,
  section,
}: z.infer<typeof getDocumentationDocumentQuerySchema>) {
  const document = await db.documentationDocument.findUnique({
    where: {
      slug,
    },
    include: documentAuthorInclude,
  });

  if (!document || (section && document.section !== section)) {
    throw new NotFoundError("Document not found");
  }

  return document;
}

export async function listDocumentationDocuments({
  section,
}: z.infer<typeof listDocumentationDocumentsQuerySchema>) {
  return db.documentationDocument.findMany({
    where: {
      section,
    },
    include: documentAuthorInclude,
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
}

export async function createPressKitMedia({
  image,
  altText,
  authorId,
}: z.infer<typeof createPressKitMediaSchema> & {
  authorId: number;
}) {
  return db.pressKitMedia.create({
    data: {
      image: image.trim(),
      altText: altText?.trim() ? altText.trim() : null,
      authorId,
    },
  });
}

export async function listPressKitMedia() {
  return db.pressKitMedia.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function deletePressKitMedia(mediaId: number) {
  const existing = await db.pressKitMedia.findUnique({
    where: {
      id: mediaId,
    },
  });

  if (!existing) {
    throw new NotFoundError("Media not found");
  }

  await db.pressKitMedia.delete({
    where: {
      id: mediaId,
    },
  });
}

