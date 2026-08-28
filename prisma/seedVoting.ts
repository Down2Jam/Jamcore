import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { createPrismaAdapter } from "../src/infra/prisma-adapter.js";

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

async function main() {
  console.log("Seeding random voting data...");

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

  const votesToCreate = [];

  // Generate random votes for each user on themes they haven't voted on yet
  for (const user of users) {
    for (const theme of themes) {
      // Check if the user already has a vote for this theme
      const existingVote = await prisma.themeVote.findFirst({
        where: {
          userId: user.id,
          themeSuggestionId: theme.id,
        },
      });

      if (!existingVote) {
        // Randomly generate a voting score (-1, 0, or +1)
        const votingScore = faker.helpers.arrayElement([-1, 0, +1]);

        // Skip adding a vote if the score is 0 (no vote)
        if (votingScore !== 0) {
          votesToCreate.push({
            userId: user.id,
            jamId: theme.jamId,
            themeSuggestionId: theme.id,
            votingScore,
          });
        }
      }
    }
  }

  // Insert all new votes into the ThemeVote table
  console.log(`Creating ${votesToCreate.length} new votes...`);
  await prisma.themeVote.createMany({
    data: votesToCreate,
    skipDuplicates: true, // Avoid duplicates if re-seeding
  });

  console.log("Seeding random voting data completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
