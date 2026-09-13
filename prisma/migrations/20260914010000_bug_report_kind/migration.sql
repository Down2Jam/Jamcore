ALTER TABLE "Report" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'content';
CREATE INDEX "Report_kind_status_id_idx" ON "Report" ("kind", "status", "id");
