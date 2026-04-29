CREATE TYPE "QuiltSubmissionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REMOVED');

CREATE TABLE "Quilt" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quilt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuiltSubmission" (
    "id" SERIAL NOT NULL,
    "quilt_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "pixels" JSONB NOT NULL,
    "status" "QuiltSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "resolves_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "removed_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuiltSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuiltVote" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuiltVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Quilt_slug_key" ON "Quilt"("slug");
CREATE INDEX "Quilt_tenant_id_ends_at_idx" ON "Quilt"("tenant_id", "ends_at");
CREATE INDEX "QuiltSubmission_quilt_id_status_created_at_idx" ON "QuiltSubmission"("quilt_id", "status", "created_at");
CREATE INDEX "QuiltSubmission_author_id_created_at_idx" ON "QuiltSubmission"("author_id", "created_at");
CREATE UNIQUE INDEX "QuiltVote_submission_id_user_id_key" ON "QuiltVote"("submission_id", "user_id");
CREATE INDEX "QuiltVote_user_id_created_at_idx" ON "QuiltVote"("user_id", "created_at");

ALTER TABLE "QuiltSubmission" ADD CONSTRAINT "QuiltSubmission_quilt_id_fkey" FOREIGN KEY ("quilt_id") REFERENCES "Quilt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuiltSubmission" ADD CONSTRAINT "QuiltSubmission_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuiltSubmission" ADD CONSTRAINT "QuiltSubmission_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuiltVote" ADD CONSTRAINT "QuiltVote_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "QuiltSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuiltVote" ADD CONSTRAINT "QuiltVote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
