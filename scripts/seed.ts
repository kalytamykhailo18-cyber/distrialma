import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("admin2026", 10);
  const customerHash = await bcrypt.hash("cliente2026", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash: adminHash, role: "admin" },
    create: {
      username: "admin",
      passwordHash: adminHash,
      role: "admin",
    },
  });

  await prisma.user.upsert({
    where: { username: "cliente" },
    update: { passwordHash: customerHash, role: "customer" },
    create: {
      username: "cliente",
      passwordHash: customerHash,
      role: "customer",
    },
  });

  console.log("Seed complete:");
  console.log("  Admin:    admin / admin2026");
  console.log("  Customer: cliente / cliente2026");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
