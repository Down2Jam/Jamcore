-- Add the search vector used by indexed search queries.
ALTER TABLE "SearchDocument"
ADD COLUMN IF NOT EXISTS "document_tsv" tsvector;

CREATE OR REPLACE FUNCTION "SearchDocument_update_document_tsv"()
RETURNS trigger AS $$
BEGIN
  NEW."document_tsv" :=
    to_tsvector(
      'simple',
      concat_ws(
        ' ',
        coalesce(NEW."title", ''),
        coalesce(NEW."subtitle", ''),
        coalesce(NEW."body", ''),
        coalesce(NEW."slug", '')
      )
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SearchDocument_update_document_tsv_trigger" ON "SearchDocument";

CREATE TRIGGER "SearchDocument_update_document_tsv_trigger"
BEFORE INSERT OR UPDATE OF "title", "subtitle", "body", "slug"
ON "SearchDocument"
FOR EACH ROW
EXECUTE FUNCTION "SearchDocument_update_document_tsv"();

UPDATE "SearchDocument"
SET "document_tsv" =
  to_tsvector(
    'simple',
    concat_ws(
      ' ',
      coalesce("title", ''),
      coalesce("subtitle", ''),
      coalesce("body", ''),
      coalesce("slug", '')
    )
  )
WHERE "document_tsv" IS NULL;

CREATE INDEX IF NOT EXISTS "SearchDocument_document_tsv_idx"
ON "SearchDocument"
USING GIN ("document_tsv");
