ALTER TABLE "DocumentationDocument"
ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

WITH ranked_documents AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY section
      ORDER BY "createdAt" ASC, id ASC
    ) - 1 AS new_order
  FROM "DocumentationDocument"
)
UPDATE "DocumentationDocument" AS document
SET "order" = ranked_documents.new_order
FROM ranked_documents
WHERE document.id = ranked_documents.id;
