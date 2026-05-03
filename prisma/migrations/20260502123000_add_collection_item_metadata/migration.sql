ALTER TABLE "CollectionItem"
  ADD COLUMN "title" text,
  ADD COLUMN "url" text,
  ADD COLUMN "thumbnail_url" text,
  ADD COLUMN "platform_links" jsonb;
