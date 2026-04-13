import { PrismaClient, GameCategory, PageVersion } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding test data...");

  const timestamp = Date.now();

  // Create test users
  const user1 = await prisma.user.create({
    data: {
      slug: `testuser1-${timestamp}`,
      name: `Test User 1 ${timestamp}`,
      email: `test1-${timestamp}@example.com`,
      password: "hashed_password_1",
      bio: "Test user for development",
    },
  });

  const user2 = await prisma.user.create({
    data: {
      slug: `testuser2-${timestamp}`,
      name: `Test User 2 ${timestamp}`,
      email: `test2-${timestamp}@example.com`,
      password: "hashed_password_2",
      bio: "Another test user",
    },
  });

  const user3 = await prisma.user.create({
    data: {
      slug: `testuser3-${timestamp}`,
      name: `Composer Test ${timestamp}`,
      email: `composer-${timestamp}@example.com`,
      password: "hashed_password_3",
      bio: "Music composer",
    },
  });

  console.log("✓ Created test users");

  // Create test jam
  const jam = await prisma.jam.create({
    data: {
      name: `Test Jam 2026 ${timestamp}`,
      isActive: true,
      startTime: new Date("2026-04-12"),
    },
  });

  console.log("✓ Created test jam");

  // Create test team
  const team = await prisma.team.create({
    data: {
      name: `Test Team ${timestamp}`,
      description: "A test team for development",
      jamId: jam.id,
      ownerId: user1.id,
    },
  });

  console.log("✓ Created test team");

  // Create test game
  const game = await prisma.game.create({
    data: {
      slug: `test-game-${timestamp}`,
      name: `Test Game ${timestamp}`,
      description: "A test game for development",
      short: "Test",
      category: GameCategory.REGULAR,
      teamId: team.id,
      jamId: jam.id,
      published: true,
      themeJustification: "We made this for testing",
    },
  });

  console.log("✓ Created test game");

  // Create GamePage records (JAM and POST_JAM versions)
  // Create JAM GamePage
  const rawGamePageJam = await prisma.$queryRaw`
    INSERT INTO "GamePage" ("version", "name", "description", "short", "category", "gameId", "createdAt", "updatedAt")
    VALUES ('JAM', ${"Test Game (JAM Version)" as any}, ${"Test game during the jam" as any}, ${"Test JAM" as any}, 'REGULAR', ${game.id}, NOW(), NOW())
    RETURNING *
  `;

  const jamGamePageId = (rawGamePageJam as any[])[0].id;

  const postJamGamePage = await prisma.$queryRaw`
    INSERT INTO "GamePage" ("version", "name", "description", "short", "category", "gameId", "createdAt", "updatedAt")
    VALUES ('POST_JAM', ${"Test Game (Post-JAM Version)" as any}, ${"Test game after the jam" as any}, ${"Test POST_JAM" as any}, 'REGULAR', ${game.id}, NOW(), NOW())
    RETURNING *
  `;

  const postJamGamePageId = (postJamGamePage as any[])[0].id;

  console.log("✓ Created GamePage records");

  // Create test tracks
  const track1 = await prisma.$queryRaw`
    INSERT INTO "GamePageTrack" ("slug", "name", "url", "license", "composerId", "gamePageId", "createdAt", "updatedAt")
    VALUES (${"background-music" as any}, ${"Background Music" as any}, ${"https://example.com/music1.mp3" as any}, ${"CC0" as any}, ${user3.id}, ${jamGamePageId}, NOW(), NOW())
    RETURNING *
  `;

  const track1Id = (track1 as any[])[0].id;

  const track2 = await prisma.$queryRaw`
    INSERT INTO "GamePageTrack" ("slug", "name", "url", "license", "composerId", "gamePageId", "createdAt", "updatedAt")
    VALUES (${"menu-theme" as any}, ${"Menu Theme" as any}, ${"https://example.com/music2.mp3" as any}, ${"CC-BY" as any}, ${user3.id}, ${jamGamePageId}, NOW(), NOW())
    RETURNING *
  `;

  console.log("✓ Created test tracks");

  // Create test achievements
  const achievement1 = await prisma.$queryRaw`
    INSERT INTO "GamePageAchievement" ("name", "description", "gamePageId", "createdAt", "updatedAt")
    VALUES ('First Victory', 'Complete the first level', ${jamGamePageId}, NOW(), NOW())
    RETURNING *
  `;

  const achievement1Id = (achievement1 as any[])[0].id;

  const achievement2 = await prisma.$queryRaw`
    INSERT INTO "GamePageAchievement" ("name", "description", "gamePageId", "createdAt", "updatedAt")
    VALUES ('Speedrunner', 'Complete the game in under 5 minutes', ${jamGamePageId}, NOW(), NOW())
    RETURNING *
  `;
  const achievement2Id = (achievement2 as any[])[0].id;
  console.log("✓ Created test achievements");

  // Link users to achievements
  await prisma.$queryRaw`
    INSERT INTO "_GamePageAchievementToUsers" ("A", "B")
    VALUES (${achievement1Id}, ${user1.id})
  `;

  await prisma.$queryRaw`
    INSERT INTO "_GamePageAchievementToUsers" ("A", "B")
    VALUES (${achievement1Id}, ${user2.id})
  `;

  await prisma.$queryRaw`
    INSERT INTO "_GamePageAchievementToUsers" ("A", "B")
    VALUES (${achievement2Id}, ${user1.id})
  `;

  console.log("✓ Linked users to achievements");

  // Create test ratings
  const ratingCategory = await prisma.ratingCategory.create({
    data: {
      name: "Gameplay",
      order: 1,
    },
  });

  // Link rating category to game page
  await prisma.$queryRaw`
    INSERT INTO "_GamePageToRatingCategory" ("A", "B")
    VALUES (${postJamGamePageId}, ${ratingCategory.id})
  `;

  // Create ratings
  await prisma.$queryRaw`
    INSERT INTO "Rating" ("value", "categoryId", "userId", "gamePageId", "gameId", "createdAt", "updatedAt")
    VALUES (9, ${ratingCategory.id}, ${user1.id}, ${postJamGamePageId}, ${game.id}, NOW(), NOW())
  `;

  await prisma.$queryRaw`
    INSERT INTO "Rating" ("value", "categoryId", "userId", "gamePageId", "gameId", "createdAt", "updatedAt")
    VALUES (8, ${ratingCategory.id}, ${user2.id}, ${postJamGamePageId}, ${game.id}, NOW(), NOW())
  `;

  console.log("✓ Created test ratings");

  console.log("\n✅ Test data added successfully!");
  console.log(`
Test data summary:
- Users: testuser1, testuser2, testuser3
- Jam: "Test Jam 2026"
- Team: "Test Team"
- Game: "Test Game"
- Game versions: JAM and POST_JAM
- Tracks: 2 background music tracks
- Achievements: 2 achievements
- Ratings: 2 ratings for post-jam version
  `);
}

main()
  .catch((e) => {
    console.error("Error adding test data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
