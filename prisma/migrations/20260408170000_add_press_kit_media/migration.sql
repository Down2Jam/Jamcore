CREATE TABLE "PressKitMedia" (
  "id" SERIAL NOT NULL,
  "image" TEXT NOT NULL,
  "altText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "authorId" INTEGER NOT NULL,

  CONSTRAINT "PressKitMedia_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PressKitMedia"
ADD CONSTRAINT "PressKitMedia_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
