import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding random users...");

  // Generate 10 random users
  const users = Array.from({ length: 10 }).map(() => ({
    slug: faker.internet.userName(),
    name: faker.name.fullName(),
    email: faker.internet.email(),
    password: faker.internet.password(8), // Use bcrypt in production
    bio: faker.lorem.sentence(),
  }));

  // Insert users into the database
  await prisma.user.createMany({
    data: users,
    skipDuplicates: true, // Avoid duplicates if the script is run multiple times
  });

  console.log("Random users seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
