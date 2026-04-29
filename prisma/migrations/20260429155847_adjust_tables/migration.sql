-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_assigned_to_id_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_collection_comment_id_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_userId_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_collaborators" DROP CONSTRAINT "jamcore_collection_collaborators_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_collaborators" DROP CONSTRAINT "jamcore_collection_collaborators_invited_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_collaborators" DROP CONSTRAINT "jamcore_collection_collaborators_user_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_comments" DROP CONSTRAINT "jamcore_collection_comments_author_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_comments" DROP CONSTRAINT "jamcore_collection_comments_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_follows" DROP CONSTRAINT "jamcore_collection_follows_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_follows" DROP CONSTRAINT "jamcore_collection_follows_user_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_imports" DROP CONSTRAINT "jamcore_collection_imports_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_imports" DROP CONSTRAINT "jamcore_collection_imports_imported_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collection_items" DROP CONSTRAINT "jamcore_collection_items_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collections" DROP CONSTRAINT "jamcore_collections_forked_from_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_collections" DROP CONSTRAINT "jamcore_collections_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_content_review_settings" DROP CONSTRAINT "jamcore_content_review_settings_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_federation_allowlist" DROP CONSTRAINT "jamcore_federation_allowlist_created_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_federation_blocks" DROP CONSTRAINT "jamcore_federation_blocks_created_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_federation_preview_queue" DROP CONSTRAINT "jamcore_federation_preview_queue_reviewed_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_federation_reputation" DROP CONSTRAINT "jamcore_federation_reputation_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_notification_preferences" DROP CONSTRAINT "jamcore_notification_preferences_user_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_autosaves" DROP CONSTRAINT "jamcore_post_autosaves_author_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_autosaves" DROP CONSTRAINT "jamcore_post_autosaves_post_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_collaborators" DROP CONSTRAINT "jamcore_post_collaborators_invited_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_collaborators" DROP CONSTRAINT "jamcore_post_collaborators_post_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_collaborators" DROP CONSTRAINT "jamcore_post_collaborators_user_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_games" DROP CONSTRAINT "jamcore_post_games_game_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_games" DROP CONSTRAINT "jamcore_post_games_post_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_revisions" DROP CONSTRAINT "jamcore_post_revisions_editor_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_revisions" DROP CONSTRAINT "jamcore_post_revisions_post_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_series" DROP CONSTRAINT "jamcore_post_series_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_series_posts" DROP CONSTRAINT "jamcore_post_series_posts_post_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_post_series_posts" DROP CONSTRAINT "jamcore_post_series_posts_series_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_radio_bans" DROP CONSTRAINT "jamcore_radio_bans_created_by_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_radio_bans" DROP CONSTRAINT "jamcore_radio_bans_track_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_radio_emotes" DROP CONSTRAINT "jamcore_radio_emotes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_radio_sessions" DROP CONSTRAINT "jamcore_radio_sessions_current_track_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_radio_votes" DROP CONSTRAINT "jamcore_radio_votes_track_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_radio_votes" DROP CONSTRAINT "jamcore_radio_votes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_report_notes" DROP CONSTRAINT "jamcore_report_notes_author_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_report_notes" DROP CONSTRAINT "jamcore_report_notes_report_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_user_follows" DROP CONSTRAINT "jamcore_user_follows_follower_id_fkey";

-- DropForeignKey
ALTER TABLE "jamcore_user_follows" DROP CONSTRAINT "jamcore_user_follows_following_id_fkey";

-- DropIndex
DROP INDEX "Game_published_jamId_id_idx";

-- DropIndex
DROP INDEX "game_page_name_trgm_idx";

-- DropIndex
DROP INDEX "GamePageTrack_updatedAt_idx";

-- DropIndex
DROP INDEX "track_name_trgm_idx";

-- DropIndex
DROP INDEX "notification_recipient_read_idx";

-- DropIndex
DROP INDEX "Post_deletedAt_removedAt_createdAt_idx";

-- DropIndex
DROP INDEX "Post_sticky_createdAt_idx";

-- DropIndex
DROP INDEX "post_publication_idx";

-- DropIndex
DROP INDEX "post_title_trgm_idx";

-- DropIndex
DROP INDEX "report_collection_comment_idx";

-- DropIndex
DROP INDEX "report_queue_idx";

-- DropIndex
DROP INDEX "team_name_trgm_idx";

-- DropIndex
DROP INDEX "User_name_idx";

-- DropIndex
DROP INDEX "user_name_trgm_idx";

-- DropIndex
DROP INDEX "jamcore_collection_comments_collection_idx";

-- DropIndex
DROP INDEX "jamcore_collection_follows_user_idx";

-- DropIndex
DROP INDEX "jamcore_collection_items_collection_idx";

-- DropIndex
DROP INDEX "jamcore_collections_discovery_idx";

-- DropIndex
DROP INDEX "jamcore_collections_tenant_visibility_idx";

-- DropIndex
DROP INDEX "jamcore_events_time_idx";

-- DropIndex
DROP INDEX "jamcore_federation_preview_queue_idx";

-- DropIndex
DROP INDEX "jamcore_post_games_game_idx";

-- DropIndex
DROP INDEX "jamcore_post_revisions_post_idx";

-- DropIndex
DROP INDEX "jamcore_post_series_discovery_idx";

-- DropIndex
DROP INDEX "jamcore_radio_emotes_recent_idx";

-- DropIndex
DROP INDEX "jamcore_remote_feed_posts_tags_idx";

-- DropIndex
DROP INDEX "jamcore_report_notes_report_idx";

-- DropIndex
DROP INDEX "jamcore_user_follows_follower_idx";

-- DropIndex
DROP INDEX "jamcore_user_follows_following_idx";

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "read_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "archived_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Post" ALTER COLUMN "scheduled_publish_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "resolved_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_collection_collaborators" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_collection_comments" ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_collection_follows" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_collection_imports" ALTER COLUMN "imported_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_collection_items" ALTER COLUMN "added_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_collections" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_content_review_settings" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_domain_events" ALTER COLUMN "occurred_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_federation_allowlist" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_federation_blocks" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_federation_preview_queue" ALTER COLUMN "reviewed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_federation_reputation" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_federation_trust_settings" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_idempotency" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_jobs" ALTER COLUMN "run_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "locked_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_notification_preferences" ALTER COLUMN "muted_types" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_post_autosaves" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_post_collaborators" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_post_games" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_post_revisions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_post_series" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_post_series_posts" ALTER COLUMN "added_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_radio_bans" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_radio_emotes" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_radio_sessions" ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "vote_options" DROP DEFAULT,
ALTER COLUMN "history" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_radio_votes" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_remote_comments" ALTER COLUMN "published_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_remote_feed_posts" ALTER COLUMN "tags" DROP DEFAULT,
ALTER COLUMN "published_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_report_notes" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_service_keys" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deprecated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "revoked_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_used_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_user_follows" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jamcore_webhook_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_delivery_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "jamcore_event_checkpoints" (
    "consumer_id" TEXT NOT NULL,
    "last_event_id" TEXT,
    "last_occurred_at" TIMESTAMP(3),
    "tenant_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jamcore_event_checkpoints_pkey" PRIMARY KEY ("consumer_id")
);

-- CreateTable
CREATE TABLE "jamcore_role_grants" (
    "id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tenant_id" TEXT,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jamcore_role_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jamcore_search_synonyms" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "term" TEXT NOT NULL,
    "synonym" TEXT NOT NULL,
    "group_key" TEXT,
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jamcore_search_synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jamcore_search_settings" (
    "tenant_id" TEXT NOT NULL,
    "exact_match_boost" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "prefix_match_boost" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "substring_match_boost" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fuzzy_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "game_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "track_weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "post_weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "user_weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "team_weight" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "freshness_half_life_hours" INTEGER NOT NULL DEFAULT 168,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jamcore_search_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "jamcore_search_documents" (
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "variant" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT NOT NULL,
    "slug" TEXT,
    "tags" JSONB NOT NULL,
    "visibility" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "source_updated_at" TIMESTAMP(3) NOT NULL,
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jamcore_search_documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "jamcore_search_reindex_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "batch_size" INTEGER NOT NULL,
    "entity_types" JSONB NOT NULL,
    "per_entity_state" JSONB NOT NULL,
    "total_count" INTEGER NOT NULL,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "jamcore_search_reindex_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jamcore_search_documents_tenant_id_entity_type_entity_id_idx" ON "jamcore_search_documents"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "jamcore_collection_comments_collection_id_created_at_idx" ON "jamcore_collection_comments"("collection_id", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_collection_follows_user_id_created_at_idx" ON "jamcore_collection_follows"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_collection_items_collection_id_position_added_at_idx" ON "jamcore_collection_items"("collection_id", "position", "added_at");

-- CreateIndex
CREATE INDEX "jamcore_collections_tenant_id_visibility_updated_at_idx" ON "jamcore_collections"("tenant_id", "visibility", "updated_at");

-- CreateIndex
CREATE INDEX "jamcore_domain_events_occurred_at_idx" ON "jamcore_domain_events"("occurred_at");

-- CreateIndex
CREATE INDEX "jamcore_federation_preview_queue_tenant_id_status_created_a_idx" ON "jamcore_federation_preview_queue"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_post_games_game_id_created_at_idx" ON "jamcore_post_games"("game_id", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_post_revisions_post_id_created_at_idx" ON "jamcore_post_revisions"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_post_series_tenant_id_visibility_updated_at_idx" ON "jamcore_post_series"("tenant_id", "visibility", "updated_at");

-- CreateIndex
CREATE INDEX "jamcore_radio_emotes_tenant_id_created_at_idx" ON "jamcore_radio_emotes"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_remote_feed_posts_tenant_id_status_published_at_cre_idx" ON "jamcore_remote_feed_posts"("tenant_id", "status", "published_at", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_report_notes_report_id_created_at_idx" ON "jamcore_report_notes"("report_id", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_user_follows_tenant_id_following_id_created_at_idx" ON "jamcore_user_follows"("tenant_id", "following_id", "created_at");

-- CreateIndex
CREATE INDEX "jamcore_user_follows_tenant_id_follower_id_created_at_idx" ON "jamcore_user_follows"("tenant_id", "follower_id", "created_at");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "jamcore_collection_collaborators_unique_user" RENAME TO "jamcore_collection_collaborators_collection_id_user_id_key";

-- RenameIndex
ALTER INDEX "jamcore_collection_items_discovery_idx" RENAME TO "jamcore_collection_items_item_type_item_id_idx";

-- RenameIndex
ALTER INDEX "jamcore_collection_items_unique_item" RENAME TO "jamcore_collection_items_collection_id_item_type_item_id_key";

-- RenameIndex
ALTER INDEX "jamcore_collections_owner_slug_key" RENAME TO "jamcore_collections_tenant_id_owner_id_slug_key";

-- RenameIndex
ALTER INDEX "jamcore_federation_allowlist_unique_value" RENAME TO "jamcore_federation_allowlist_tenant_id_allow_type_value_key";

-- RenameIndex
ALTER INDEX "jamcore_federation_blocks_unique_value" RENAME TO "jamcore_federation_blocks_tenant_id_block_type_value_key";

-- RenameIndex
ALTER INDEX "jamcore_federation_reputation_host_key" RENAME TO "jamcore_federation_reputation_tenant_id_host_key";

-- RenameIndex
ALTER INDEX "jamcore_idempotency_expiry_idx" RENAME TO "jamcore_idempotency_expires_at_idx";

-- RenameIndex
ALTER INDEX "jamcore_jobs_due_idx" RENAME TO "jamcore_jobs_status_run_at_idx";

-- RenameIndex
ALTER INDEX "jamcore_post_autosaves_author_post_key" RENAME TO "jamcore_post_autosaves_tenant_id_author_id_post_id_key";

-- RenameIndex
ALTER INDEX "jamcore_post_series_owner_slug_key" RENAME TO "jamcore_post_series_tenant_id_owner_id_slug_key";

-- RenameIndex
ALTER INDEX "jamcore_post_series_posts_post_idx" RENAME TO "jamcore_post_series_posts_post_id_idx";

-- RenameIndex
ALTER INDEX "jamcore_radio_votes_round_idx" RENAME TO "jamcore_radio_votes_tenant_id_vote_round_track_id_idx";

-- RenameIndex
ALTER INDEX "jamcore_remote_comments_target_id_idx" RENAME TO "remote_comments_target_id_idx";

-- RenameIndex
ALTER INDEX "jamcore_remote_comments_target_slug_idx" RENAME TO "remote_comments_target_slug_idx";

-- RenameIndex
ALTER INDEX "jamcore_remote_comments_tenant_object_idx" RENAME TO "jamcore_remote_comments_tenant_id_object_id_key";

-- RenameIndex
ALTER INDEX "jamcore_remote_feed_posts_tenant_object_idx" RENAME TO "jamcore_remote_feed_posts_tenant_id_object_id_key";
