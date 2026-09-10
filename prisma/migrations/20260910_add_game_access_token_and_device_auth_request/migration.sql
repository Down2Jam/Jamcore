-- CreateTable
CREATE TABLE "GameAccessToken" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "GameAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAuthRequest" (
    "id" TEXT NOT NULL,
    "device_code" TEXT NOT NULL,
    "user_code" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "userId" INTEGER,
    "token_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_polled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceAuthRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameAccessToken_userId_idx" ON "GameAccessToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAuthRequest_device_code_key" ON "DeviceAuthRequest"("device_code");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAuthRequest_user_code_key" ON "DeviceAuthRequest"("user_code");

-- AddForeignKey
ALTER TABLE "GameAccessToken" ADD CONSTRAINT "GameAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
