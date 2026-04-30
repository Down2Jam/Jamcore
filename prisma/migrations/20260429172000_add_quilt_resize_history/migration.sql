CREATE TYPE "QuiltSubmissionKind" AS ENUM ('PIXELS', 'RESIZE');

ALTER TABLE "QuiltSubmission"
  ADD COLUMN "kind" "QuiltSubmissionKind" NOT NULL DEFAULT 'PIXELS',
  ADD COLUMN "canvas_width" INTEGER,
  ADD COLUMN "canvas_height" INTEGER,
  ADD COLUMN "resize_from_width" INTEGER,
  ADD COLUMN "resize_from_height" INTEGER,
  ADD COLUMN "resize_offset_x" INTEGER,
  ADD COLUMN "resize_offset_y" INTEGER;

UPDATE "QuiltSubmission" submission
SET
  "canvas_width" = quilt."width",
  "canvas_height" = quilt."height"
FROM "Quilt" quilt
WHERE submission."quilt_id" = quilt."id";
