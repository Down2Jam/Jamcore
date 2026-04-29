-- Users, posts, and teams do not have page-version variants.
ALTER TABLE "jamcore_search_documents" ALTER COLUMN "variant" DROP NOT NULL;
