-- Add nullable tenant columns required by core tenant isolation checks.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "Jam" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

CREATE INDEX IF NOT EXISTS "User_tenant_id_idx" ON "User"("tenant_id");
CREATE INDEX IF NOT EXISTS "Post_tenant_id_createdAt_idx" ON "Post"("tenant_id", "createdAt");
CREATE INDEX IF NOT EXISTS "Jam_tenant_id_startTime_idx" ON "Jam"("tenant_id", "startTime");
CREATE INDEX IF NOT EXISTS "Game_tenant_id_jamId_idx" ON "Game"("tenant_id", "jamId");
CREATE INDEX IF NOT EXISTS "Team_tenant_id_jamId_idx" ON "Team"("tenant_id", "jamId");
