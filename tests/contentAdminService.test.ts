import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    documentationDocument: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(async () => ({ id: 1, slug: "hello-world" })),
      update: vi.fn(async () => ({ id: 1 })),
      delete: vi.fn(async () => ({})),
    },
    pressKitMedia: {
      create: vi.fn(async () => ({ id: 4 })),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import { NotFoundError } from "../src/lib/errors.js";
import {
  createDocumentationDocument,
  createPressKitMedia,
  deleteDocumentationDocument,
  deletePressKitMedia,
  getDocumentationDocumentBySlug,
  listDocumentationDocuments,
  listPressKitMedia,
  updateDocumentationDocument,
} from "../src/features/content-admin";

describe("content admin service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.documentationDocument.findFirst.mockReset();
    dbMock.documentationDocument.findMany.mockReset();
    dbMock.documentationDocument.findUnique.mockReset();
    dbMock.pressKitMedia.findMany.mockReset();
    dbMock.pressKitMedia.findUnique.mockReset();
  });

  it("creates a documentation document with a stable slug and next order", async () => {
    dbMock.documentationDocument.findFirst.mockResolvedValueOnce({ order: 2 });
    dbMock.documentationDocument.findUnique
      .mockResolvedValueOnce({ id: 9 })
      .mockResolvedValueOnce(null);

    await createDocumentationDocument({
      title: "Hello World",
      content: "Doc body",
      section: "DOCS",
      icon: "",
      authorId: 2,
    });

    expect(dbMock.documentationDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: "hello-world-2",
          order: 3,
          icon: "book",
        }),
      }),
    );
  });

  it("updates and deletes documentation documents", async () => {
    dbMock.documentationDocument.findUnique.mockResolvedValueOnce({
      id: 1,
      title: "Old",
      content: "Old body",
      icon: "book",
    });

    await updateDocumentationDocument({
      documentId: 1,
      title: "New",
    });

    expect(dbMock.documentationDocument.update).toHaveBeenCalled();

    dbMock.documentationDocument.findUnique.mockResolvedValueOnce({ id: 1 });
    await deleteDocumentationDocument(1);
    expect(dbMock.documentationDocument.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it("creates and deletes press kit media", async () => {
    await createPressKitMedia({
      image: " /img.png ",
      altText: " Alt ",
      authorId: 2,
    });

    expect(dbMock.pressKitMedia.create).toHaveBeenCalledWith({
      data: {
        image: "/img.png",
        altText: "Alt",
        authorId: 2,
      },
    });

    dbMock.pressKitMedia.findUnique.mockResolvedValueOnce({ id: 4 });
    await deletePressKitMedia(4);
    expect(dbMock.pressKitMedia.delete).toHaveBeenCalledWith({
      where: { id: 4 },
    });
  });

  it("loads documentation reads through the feature service", async () => {
    dbMock.documentationDocument.findUnique.mockResolvedValueOnce({
      id: 1,
      slug: "hello-world",
      section: "DOCS",
    });
    dbMock.documentationDocument.findMany.mockResolvedValueOnce([{ id: 1 }]);
    dbMock.pressKitMedia.findMany.mockResolvedValueOnce([{ id: 4 }]);

    await expect(
      getDocumentationDocumentBySlug({
        slug: "hello-world",
        section: "DOCS",
      }),
    ).resolves.toEqual({
      id: 1,
      slug: "hello-world",
      section: "DOCS",
    });

    await expect(listDocumentationDocuments({ section: "DOCS" })).resolves.toEqual([
      { id: 1 },
    ]);
    await expect(listPressKitMedia()).resolves.toEqual([{ id: 4 }]);
  });

  it("throws for missing admin-managed records", async () => {
    dbMock.documentationDocument.findUnique.mockResolvedValueOnce(null);
    await expect(deleteDocumentationDocument(99)).rejects.toBeInstanceOf(NotFoundError);

    dbMock.pressKitMedia.findUnique.mockResolvedValueOnce(null);
    await expect(deletePressKitMedia(99)).rejects.toBeInstanceOf(NotFoundError);
  });
});

