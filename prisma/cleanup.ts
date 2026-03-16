import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL || "";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const deleted = await prisma.transaction.deleteMany({});
  console.log(`Deleted ${deleted.count} transactions`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
