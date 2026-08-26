import { PrismaClient } from '@prisma/client';
import { seedCouncils } from '../src/domain/seedData.js';

const prisma = new PrismaClient();

seedCouncils(prisma)
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
