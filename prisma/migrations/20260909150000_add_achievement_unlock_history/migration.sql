CREATE TABLE "AchievementUnlock" (
    "achievementId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementUnlock_pkey" PRIMARY KEY ("achievementId", "userId")
);

-- The old implicit many-to-many relation has no earned timestamp. Use the
-- achievement creation time as the least-surprising historical fallback.
INSERT INTO "AchievementUnlock" ("achievementId", "userId", "earnedAt")
SELECT relation."A", relation."B", achievement."createdAt"
FROM "_GamePageAchievementToUsers" AS relation
JOIN "GamePageAchievement" AS achievement ON achievement."id" = relation."A"
ON CONFLICT ("achievementId", "userId") DO NOTHING;

CREATE INDEX "AchievementUnlock_earnedAt_idx" ON "AchievementUnlock"("earnedAt" DESC);
CREATE INDEX "AchievementUnlock_userId_idx" ON "AchievementUnlock"("userId");

ALTER TABLE "AchievementUnlock"
ADD CONSTRAINT "AchievementUnlock_achievementId_fkey"
FOREIGN KEY ("achievementId") REFERENCES "GamePageAchievement"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AchievementUnlock"
ADD CONSTRAINT "AchievementUnlock_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
