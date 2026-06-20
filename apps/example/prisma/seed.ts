import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Demo User",
      profile: {
        create: { bio: "Hello world", phone: "+1-555-0100" },
      },
      orders: {
        create: [
          { product: "Pro Plan", amount: 29.99 },
          { product: "Add-on", amount: 9.99 },
        ],
      },
      sessions: {
        create: [{ token: "sess_demo_token", expiresAt: new Date(Date.now() + 86400000) }],
      },
    },
  });

  await prisma.invoice.upsert({
    where: { id: "inv_demo" },
    update: {},
    create: {
      id: "inv_demo",
      userId: user.id,
      amount: 29.99,
      taxId: "TAX-123",
    },
  });

  console.log("Seeded demo user:", user.id, user.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
