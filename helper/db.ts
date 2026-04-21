import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  omit: {
    user: {
      password: true,
      email: true,
    },
    rating: {
      value: true,
    },
  },
});

export default db;
