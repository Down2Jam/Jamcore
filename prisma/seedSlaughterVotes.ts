import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { createPrismaAdapter } from "../src/infra/prisma-adapter.js";

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

async function main() {
  console.log("Seeding random slaughter votes...");

  // Fetch all users
  const users = await prisma.user.findMany();
  if (users.length === 0) {
    throw new Error("No users found in the database.");
  }

  // Fetch all theme suggestions
  const themes = await prisma.themeSuggestion.findMany();
  if (themes.length === 0) {
    throw new Error("No theme suggestions found in the database.");
  }

  const votes = [];
  const themeUpdates = {};

  // Generate random slaughter votes for each user on each theme
  for (const user of users) {
    for (const theme of themes) {
      // Randomly generate a slaughter vote (-1, 0, or +1)
      const slaughterScore = faker.helpers.arrayElement([-1, 0, +1]);

      // Skip adding a vote if the score is 0 (no vote)
      if (slaughterScore !== 0) {
        votes.push({
          userId: user.id,
          jamId: theme.jamId,
          themeSuggestionId: theme.id,
          slaughterScore,
        });
      }
    }
  }

  // Insert votes into the ThemeVote table
  console.log(`Creating ${votes.length} slaughter votes...`);
  await prisma.themeVote.createMany({
    data: votes,
    skipDuplicates: true, // Avoid duplicates if re-seeding
  });

  console.log("Seeding random slaughter votes completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
