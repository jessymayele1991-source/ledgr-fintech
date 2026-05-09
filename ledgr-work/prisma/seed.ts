/**
 * Ledgr Database Seeder
 * Seeds default categories matching AI categorization engine slugs.
 * Run: npm run db:seed
 * Idempotent — safe to re-run.
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SYSTEM_CATEGORIES = [
  // INCOME
  { name: "Salary",              type: "INCOME"   as const, color: "#10b981", icon: "💼", isSystem: true },
  { name: "Freelance Revenue",   type: "INCOME"   as const, color: "#06b6d4", icon: "💻", isSystem: true },
  { name: "Child Benefit",       type: "INCOME"   as const, color: "#84cc16", icon: "👶", isSystem: true },
  { name: "Refund Received",     type: "INCOME"   as const, color: "#22d3ee", icon: "↩️", isSystem: true },
  { name: "Interest",            type: "INCOME"   as const, color: "#a3e635", icon: "🏦", isSystem: true },
  { name: "Other Income",        type: "INCOME"   as const, color: "#6ee7b7", icon: "💰", isSystem: false },
  // EXPENSE
  { name: "Groceries",           type: "EXPENSE"  as const, color: "#f59e0b", icon: "🛒", isSystem: true },
  { name: "Fuel",                type: "EXPENSE"  as const, color: "#ef4444", icon: "⛽", isSystem: true },
  { name: "Telecom",             type: "EXPENSE"  as const, color: "#8b5cf6", icon: "📱", isSystem: true },
  { name: "Online Payments",     type: "EXPENSE"  as const, color: "#3b82f6", icon: "💳", isSystem: true },
  { name: "Subscriptions",       type: "EXPENSE"  as const, color: "#6366f1", icon: "🔄", isSystem: true },
  { name: "Health Insurance",    type: "EXPENSE"  as const, color: "#ec4899", icon: "🏥", isSystem: true },
  { name: "Taxes",               type: "EXPENSE"  as const, color: "#dc2626", icon: "🏛️", isSystem: true },
  { name: "Government",          type: "EXPENSE"  as const, color: "#b91c1c", icon: "🏛️", isSystem: true },
  { name: "Restaurants & Food",  type: "EXPENSE"  as const, color: "#f97316", icon: "🍽️", isSystem: false },
  { name: "Bank Fees",           type: "EXPENSE"  as const, color: "#6b7280", icon: "🏦", isSystem: true },
  { name: "Travel",              type: "EXPENSE"  as const, color: "#0ea5e9", icon: "✈️", isSystem: false },
  { name: "Shopping",            type: "EXPENSE"  as const, color: "#a855f7", icon: "🛍️", isSystem: false },
  { name: "Loans & Debt",        type: "EXPENSE"  as const, color: "#dc2626", icon: "📋", isSystem: false },
  { name: "Charity",             type: "EXPENSE"  as const, color: "#14b8a6", icon: "❤️",  isSystem: false },
  { name: "Digital & Entertainment", type: "EXPENSE" as const, color: "#7c3aed", icon: "🎮", isSystem: false },
  { name: "International Transfer",  type: "EXPENSE" as const, color: "#0284c7", icon: "🌍", isSystem: false },
  { name: "Other Expense",       type: "EXPENSE"  as const, color: "#9ca3af", icon: "💸", isSystem: false },
  // TRANSFER
  { name: "Internal Transfer",   type: "TRANSFER" as const, color: "#64748b", icon: "🔁", isSystem: true },
  { name: "Savings",             type: "TRANSFER" as const, color: "#22c55e", icon: "🏦", isSystem: false },
  { name: "Investment",          type: "TRANSFER" as const, color: "#eab308", icon: "📈", isSystem: false },
];

async function seed() {
  console.log("🌱 Ledgr seeder starting…");
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  if (users.length === 0) {
    console.log("ℹ️  No users found. Run after creating your first account.");
    return;
  }
  let created = 0, skipped = 0;
  for (const user of users) {
    console.log(`\n📋 Seeding for ${user.email}…`);
    for (const cat of SYSTEM_CATEGORIES) {
      const exists = await prisma.category.findFirst({ where: { userId: user.id, name: cat.name } });
      if (exists) { skipped++; continue; }
      await prisma.category.create({ data: { userId: user.id, ...cat } });
      created++;
    }
  }
  console.log(`\n✅ Done: ${created} created, ${skipped} skipped`);
}

seed()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
