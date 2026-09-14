CREATE TABLE "OAuthApp" (
  "id" TEXT PRIMARY KEY, "ownerId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL, "redirectUris" TEXT[] NOT NULL, "disabledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OAuthApp_ownerId_idx" ON "OAuthApp"("ownerId");
CREATE TABLE "OAuthCode" (
  "hash" TEXT PRIMARY KEY, "appId" TEXT NOT NULL REFERENCES "OAuthApp"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" INTEGER NOT NULL, "tenantId" TEXT, "redirectUri" TEXT NOT NULL, "challenge" TEXT NOT NULL, "sessionId" TEXT,
  "scopes" TEXT[] NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3)
);
CREATE INDEX "OAuthCode_expiresAt_idx" ON "OAuthCode"("expiresAt");
CREATE TABLE "AuthSession" (
  "id" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tenantId" TEXT, "appId" TEXT REFERENCES "OAuthApp"("id") ON DELETE CASCADE ON UPDATE CASCADE, "scopes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_appId_idx" ON "AuthSession"("appId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE TABLE "AccessToken" (
  "hash" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AccessToken_sessionId_idx" ON "AccessToken"("sessionId");
CREATE INDEX "AccessToken_expiresAt_idx" ON "AccessToken"("expiresAt");
CREATE TABLE "RefreshToken" (
  "hash" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3)
);
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
