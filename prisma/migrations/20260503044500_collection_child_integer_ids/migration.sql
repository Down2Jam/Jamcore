CREATE SEQUENCE IF NOT EXISTS "CollectionItem_id_seq";
CREATE SEQUENCE IF NOT EXISTS "CollectionCollaborator_id_seq";
CREATE SEQUENCE IF NOT EXISTS "CollectionComment_id_seq";
CREATE SEQUENCE IF NOT EXISTS "CollectionImport_id_seq";

ALTER TABLE "CollectionItem" ADD COLUMN IF NOT EXISTS id_int INTEGER;
UPDATE "CollectionItem" SET id_int = nextval('"CollectionItem_id_seq"') WHERE id_int IS NULL;
ALTER TABLE "CollectionItem" ALTER COLUMN id_int SET NOT NULL;

ALTER TABLE "CollectionCollaborator" ADD COLUMN IF NOT EXISTS id_int INTEGER;
UPDATE "CollectionCollaborator" SET id_int = nextval('"CollectionCollaborator_id_seq"') WHERE id_int IS NULL;
ALTER TABLE "CollectionCollaborator" ALTER COLUMN id_int SET NOT NULL;

ALTER TABLE "CollectionComment" ADD COLUMN IF NOT EXISTS id_int INTEGER;
UPDATE "CollectionComment" SET id_int = nextval('"CollectionComment_id_seq"') WHERE id_int IS NULL;
ALTER TABLE "CollectionComment" ALTER COLUMN id_int SET NOT NULL;

ALTER TABLE "CollectionImport" ADD COLUMN IF NOT EXISTS id_int INTEGER;
UPDATE "CollectionImport" SET id_int = nextval('"CollectionImport_id_seq"') WHERE id_int IS NULL;
ALTER TABLE "CollectionImport" ALTER COLUMN id_int SET NOT NULL;

ALTER TABLE "CollectionItem" DROP CONSTRAINT IF EXISTS "CollectionItem_pkey";
ALTER TABLE "CollectionItem" DROP CONSTRAINT IF EXISTS "jamcore_collection_items_pkey";
ALTER TABLE "CollectionCollaborator" DROP CONSTRAINT IF EXISTS "CollectionCollaborator_pkey";
ALTER TABLE "CollectionCollaborator" DROP CONSTRAINT IF EXISTS "jamcore_collection_collaborators_pkey";
ALTER TABLE "CollectionComment" DROP CONSTRAINT IF EXISTS "CollectionComment_pkey";
ALTER TABLE "CollectionComment" DROP CONSTRAINT IF EXISTS "jamcore_collection_comments_pkey";
ALTER TABLE "CollectionImport" DROP CONSTRAINT IF EXISTS "CollectionImport_pkey";
ALTER TABLE "CollectionImport" DROP CONSTRAINT IF EXISTS "jamcore_collection_imports_pkey";

ALTER TABLE "CollectionItem" DROP COLUMN id;
ALTER TABLE "CollectionItem" RENAME COLUMN id_int TO id;
ALTER SEQUENCE "CollectionItem_id_seq" OWNED BY "CollectionItem".id;
ALTER TABLE "CollectionItem" ALTER COLUMN id SET DEFAULT nextval('"CollectionItem_id_seq"');
SELECT setval('"CollectionItem_id_seq"', COALESCE((SELECT MAX(id) FROM "CollectionItem"), 0) + 1, false);
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_pkey" PRIMARY KEY (id);

ALTER TABLE "CollectionCollaborator" DROP COLUMN id;
ALTER TABLE "CollectionCollaborator" RENAME COLUMN id_int TO id;
ALTER SEQUENCE "CollectionCollaborator_id_seq" OWNED BY "CollectionCollaborator".id;
ALTER TABLE "CollectionCollaborator" ALTER COLUMN id SET DEFAULT nextval('"CollectionCollaborator_id_seq"');
SELECT setval('"CollectionCollaborator_id_seq"', COALESCE((SELECT MAX(id) FROM "CollectionCollaborator"), 0) + 1, false);
ALTER TABLE "CollectionCollaborator" ADD CONSTRAINT "CollectionCollaborator_pkey" PRIMARY KEY (id);

ALTER TABLE "CollectionComment" DROP COLUMN id;
ALTER TABLE "CollectionComment" RENAME COLUMN id_int TO id;
ALTER SEQUENCE "CollectionComment_id_seq" OWNED BY "CollectionComment".id;
ALTER TABLE "CollectionComment" ALTER COLUMN id SET DEFAULT nextval('"CollectionComment_id_seq"');
SELECT setval('"CollectionComment_id_seq"', COALESCE((SELECT MAX(id) FROM "CollectionComment"), 0) + 1, false);
ALTER TABLE "CollectionComment" ADD CONSTRAINT "CollectionComment_pkey" PRIMARY KEY (id);

ALTER TABLE "CollectionImport" DROP COLUMN id;
ALTER TABLE "CollectionImport" RENAME COLUMN id_int TO id;
ALTER SEQUENCE "CollectionImport_id_seq" OWNED BY "CollectionImport".id;
ALTER TABLE "CollectionImport" ALTER COLUMN id SET DEFAULT nextval('"CollectionImport_id_seq"');
SELECT setval('"CollectionImport_id_seq"', COALESCE((SELECT MAX(id) FROM "CollectionImport"), 0) + 1, false);
ALTER TABLE "CollectionImport" ADD CONSTRAINT "CollectionImport_pkey" PRIMARY KEY (id);
