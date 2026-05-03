ALTER TABLE "CollectionItem" DROP CONSTRAINT IF EXISTS "jamcore_collection_items_type_check";
ALTER TABLE "CollectionItem" DROP CONSTRAINT IF EXISTS "CollectionItem_item_type_check";

ALTER TABLE "CollectionItem"
  ADD CONSTRAINT "CollectionItem_item_type_check"
  CHECK (item_type IN ('game', 'post', 'track', 'youtube_track'));
