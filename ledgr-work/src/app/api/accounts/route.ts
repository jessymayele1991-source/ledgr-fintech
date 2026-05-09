import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { createAccountSchema } from "@/lib/validations/schemas";
import { normalizeIban } from "@/lib/accounting/engine";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const accounts = await prisma.account.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return apiSuccess(accounts);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json();
  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

  const data = parsed.data;

  // Normalize IBAN
  const iban = data.iban ? normalizeIban(data.iban) : null;

  // Check for duplicate IBAN
  if (iban) {
    const existing = await prisma.account.findUnique({
      where: { userId_iban: { userId: user.id, iban } },
    });
    if (existing) return apiError("An account with this IBAN already exists", 409);
  }

  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: data.name,
      iban: iban || null,
      bic: data.bic || null,
      currency: data.currency,
      type: data.type,
      color: data.color || null,
    },
  });

  return apiSuccess(account, 201);
}
