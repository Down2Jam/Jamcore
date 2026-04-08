CREATE TYPE "DocumentationSection" AS ENUM ('DOCS', 'PRESS_KIT');

CREATE TABLE "DocumentationDocument" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "section" "DocumentationSection" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "DocumentationDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentationDocument_slug_key" ON "DocumentationDocument"("slug");

ALTER TABLE "DocumentationDocument" ADD CONSTRAINT "DocumentationDocument_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
