CREATE SEQUENCE IF NOT EXISTS "Collection_id_seq";

ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS id_int INTEGER;
UPDATE "Collection" SET id_int = nextval('"Collection_id_seq"') WHERE id_int IS NULL;
ALTER TABLE "Collection" ALTER COLUMN id_int SET NOT NULL;

ALTER TABLE "CollectionItem" ADD COLUMN IF NOT EXISTS collection_id_int INTEGER;
UPDATE "CollectionItem" item
SET collection_id_int = collection.id_int
FROM "Collection" collection
WHERE item.collection_id = collection.id;
ALTER TABLE "CollectionItem" ALTER COLUMN collection_id_int SET NOT NULL;

ALTER TABLE "CollectionCollaborator" ADD COLUMN IF NOT EXISTS collection_id_int INTEGER;
UPDATE "CollectionCollaborator" collaborator
SET collection_id_int = collection.id_int
FROM "Collection" collection
WHERE collaborator.collection_id = collection.id;
ALTER TABLE "CollectionCollaborator" ALTER COLUMN collection_id_int SET NOT NULL;

ALTER TABLE "CollectionComment" ADD COLUMN IF NOT EXISTS collection_id_int INTEGER;
UPDATE "CollectionComment" collection_comment
SET collection_id_int = collection.id_int
FROM "Collection" collection
WHERE collection_comment.collection_id = collection.id;
ALTER TABLE "CollectionComment" ALTER COLUMN collection_id_int SET NOT NULL;

ALTER TABLE "CollectionFollow" ADD COLUMN IF NOT EXISTS collection_id_int INTEGER;
UPDATE "CollectionFollow" follow
SET collection_id_int = collection.id_int
FROM "Collection" collection
WHERE follow.collection_id = collection.id;
ALTER TABLE "CollectionFollow" ALTER COLUMN collection_id_int SET NOT NULL;

ALTER TABLE "CollectionImport" ADD COLUMN IF NOT EXISTS collection_id_int INTEGER;
UPDATE "CollectionImport" collection_import
SET collection_id_int = collection.id_int
FROM "Collection" collection
WHERE collection_import.collection_id = collection.id;
ALTER TABLE "CollectionImport" ALTER COLUMN collection_id_int SET NOT NULL;

ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS forked_from_id_int INTEGER;
UPDATE "Collection" child
SET forked_from_id_int = parent.id_int
FROM "Collection" parent
WHERE child.forked_from_id = parent.id;

ALTER TABLE "CollectionItem" DROP CONSTRAINT IF EXISTS "CollectionItem_collection_id_fkey";
ALTER TABLE "CollectionCollaborator" DROP CONSTRAINT IF EXISTS "CollectionCollaborator_collection_id_fkey";
ALTER TABLE "CollectionComment" DROP CONSTRAINT IF EXISTS "CollectionComment_collection_id_fkey";
ALTER TABLE "CollectionFollow" DROP CONSTRAINT IF EXISTS "CollectionFollow_collection_id_fkey";
ALTER TABLE "CollectionImport" DROP CONSTRAINT IF EXISTS "CollectionImport_collection_id_fkey";
ALTER TABLE "Collection" DROP CONSTRAINT IF EXISTS "Collection_forked_from_id_fkey";

ALTER TABLE "CollectionItem" DROP CONSTRAINT IF EXISTS "jamcore_collection_items_collection_id_fkey";
ALTER TABLE "CollectionCollaborator" DROP CONSTRAINT IF EXISTS "jamcore_collection_collaborators_collection_id_fkey";
ALTER TABLE "CollectionComment" DROP CONSTRAINT IF EXISTS "jamcore_collection_comments_collection_id_fkey";
ALTER TABLE "CollectionFollow" DROP CONSTRAINT IF EXISTS "jamcore_collection_follows_collection_id_fkey";
ALTER TABLE "CollectionImport" DROP CONSTRAINT IF EXISTS "jamcore_collection_imports_collection_id_fkey";
ALTER TABLE "Collection" DROP CONSTRAINT IF EXISTS "jamcore_collections_forked_from_id_fkey";

ALTER TABLE "Collection" DROP CONSTRAINT IF EXISTS "Collection_pkey";
ALTER TABLE "Collection" DROP CONSTRAINT IF EXISTS "jamcore_collections_pkey";

DROP INDEX IF EXISTS "Collection_tenant_id_owner_id_slug_key";
DROP INDEX IF EXISTS "Collection_tenant_id_slug_key";
DROP INDEX IF EXISTS "Collection_tenant_id_visibility_updated_at_idx";
DROP INDEX IF EXISTS "jamcore_collections_tenant_id_owner_id_slug_key";
DROP INDEX IF EXISTS "jamcore_collections_tenant_id_slug_key";
DROP INDEX IF EXISTS "jamcore_collections_tenant_id_visibility_updated_at_idx";

DROP INDEX IF EXISTS "CollectionItem_collection_id_item_type_item_id_key";
DROP INDEX IF EXISTS "CollectionItem_collection_id_position_added_at_idx";
DROP INDEX IF EXISTS "jamcore_collection_items_unique_item";
DROP INDEX IF EXISTS "jamcore_collection_items_collection_idx";

DROP INDEX IF EXISTS "CollectionCollaborator_collection_id_user_id_key";
DROP INDEX IF EXISTS "jamcore_collection_collaborators_unique_user";

DROP INDEX IF EXISTS "CollectionComment_collection_id_created_at_idx";
DROP INDEX IF EXISTS "jamcore_collection_comments_collection_idx";

ALTER TABLE "CollectionFollow" DROP CONSTRAINT IF EXISTS "CollectionFollow_pkey";
ALTER TABLE "CollectionFollow" DROP CONSTRAINT IF EXISTS "jamcore_collection_follows_pkey";

ALTER TABLE "Collection" DROP COLUMN forked_from_id;
ALTER TABLE "Collection" DROP COLUMN id;
ALTER TABLE "Collection" RENAME COLUMN id_int TO id;
ALTER TABLE "Collection" RENAME COLUMN forked_from_id_int TO forked_from_id;
ALTER SEQUENCE "Collection_id_seq" OWNED BY "Collection".id;
ALTER TABLE "Collection" ALTER COLUMN id SET DEFAULT nextval('"Collection_id_seq"');
SELECT setval('"Collection_id_seq"', COALESCE((SELECT MAX(id) FROM "Collection"), 0) + 1, false);

ALTER TABLE "CollectionItem" DROP COLUMN collection_id;
ALTER TABLE "CollectionItem" RENAME COLUMN collection_id_int TO collection_id;

ALTER TABLE "CollectionCollaborator" DROP COLUMN collection_id;
ALTER TABLE "CollectionCollaborator" RENAME COLUMN collection_id_int TO collection_id;

ALTER TABLE "CollectionComment" DROP COLUMN collection_id;
ALTER TABLE "CollectionComment" RENAME COLUMN collection_id_int TO collection_id;

ALTER TABLE "CollectionFollow" DROP COLUMN collection_id;
ALTER TABLE "CollectionFollow" RENAME COLUMN collection_id_int TO collection_id;

ALTER TABLE "CollectionImport" DROP COLUMN collection_id;
ALTER TABLE "CollectionImport" RENAME COLUMN collection_id_int TO collection_id;

WITH duplicate_slugs AS (
  SELECT
    id,
    slug,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, slug ORDER BY id) AS duplicate_number
  FROM "Collection"
)
UPDATE "Collection" collection
SET slug = LEFT(duplicate_slugs.slug || '-' || duplicate_slugs.duplicate_number, 80)
FROM duplicate_slugs
WHERE collection.id = duplicate_slugs.id
  AND duplicate_slugs.duplicate_number > 1;

ALTER TABLE "Collection" ADD CONSTRAINT "Collection_pkey" PRIMARY KEY (id);
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_forked_from_id_fkey"
  FOREIGN KEY (forked_from_id) REFERENCES "Collection"(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collection_id_fkey"
  FOREIGN KEY (collection_id) REFERENCES "Collection"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionCollaborator" ADD CONSTRAINT "CollectionCollaborator_collection_id_fkey"
  FOREIGN KEY (collection_id) REFERENCES "Collection"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionComment" ADD CONSTRAINT "CollectionComment_collection_id_fkey"
  FOREIGN KEY (collection_id) REFERENCES "Collection"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionFollow" ADD CONSTRAINT "CollectionFollow_collection_id_fkey"
  FOREIGN KEY (collection_id) REFERENCES "Collection"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionImport" ADD CONSTRAINT "CollectionImport_collection_id_fkey"
  FOREIGN KEY (collection_id) REFERENCES "Collection"(id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Collection_tenant_id_slug_key" ON "Collection"(tenant_id, slug);
CREATE INDEX "Collection_tenant_id_visibility_updated_at_idx" ON "Collection"(tenant_id, visibility, updated_at);
CREATE UNIQUE INDEX "CollectionItem_collection_id_item_type_item_id_key" ON "CollectionItem"(collection_id, item_type, item_id);
CREATE INDEX "CollectionItem_collection_id_position_added_at_idx" ON "CollectionItem"(collection_id, position, added_at);
CREATE UNIQUE INDEX "CollectionCollaborator_collection_id_user_id_key" ON "CollectionCollaborator"(collection_id, user_id);
CREATE INDEX "CollectionComment_collection_id_created_at_idx" ON "CollectionComment"(collection_id, created_at);
ALTER TABLE "CollectionFollow" ADD CONSTRAINT "CollectionFollow_pkey" PRIMARY KEY (collection_id, user_id);
