import { PrismaClient } from "@prisma/client";
import { getCurrentActiveJam } from "../services/jamService";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding random suggestions...");

  // Fetch all users
  const users = await prisma.user.findMany();

  // Use getCurrentActiveJam to fetch the active jam
  const activeJam = await getCurrentActiveJam();
  if (!activeJam || !activeJam.jam) {
    throw new Error("No active jam found.");
  }


  // Create random suggestions for each user
  const suggestions = [];
  for (const user of users) {
    const suggestionCount = faker.number.int({
      min: 1,
      max: activeJam.jam.themePerUser || 5, // Limit based on themePerUser
    });

    for (let i = 0; i < suggestionCount; i++) {
      suggestions.push({
        suggestion: faker.lorem.words(3),
        userId: user.id,
        jamId: activeJam.jam.id,
      });
    }
  }

  // Insert suggestions into the database
  try {
    await prisma.themeSuggestion.createMany({
      data: suggestions,
      skipDuplicates: true,
    });
    console.log("Random suggestions seeded successfully!");
  } catch (error) {
    console.error("Error creating suggestions:", error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
