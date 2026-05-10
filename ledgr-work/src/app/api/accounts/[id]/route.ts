import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { updateAccountSchema } from "@/lib/validations/schemas";
import { normalizeIban } from "@/lib/accounting/engine";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);
    const account = await prisma.account.findFirst({ where: { id: params.id, userId: user.id } });
    if (!account) return apiError("Account not found", 404);
    return apiSuccess(account);
  } catch (err) {
    console.error("[accounts/[id]] GET error:", err);
    return apiError("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);
    const existing = await prisma.account.findFirst({ where: { id: params.id, userId: user.id } });
    if (!existing) return apiError("Account not found", 404);
    const body = await request.json();
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);
    const iban = parsed.data.iban ? normalizeIban(parsed.data.iban) : undefined;
    const updated = await prisma.account.update({
      where: { id: params.id },
      data: { ...parsed.data, iban: iban ?? null },
    });
    return apiSuccess(updated);
  } catch (err) {
    console.error("[accounts/[id]] PATCH error:", err);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);
    const existing = await prisma.account.findFirst({ where: { id: params.id, userId: user.id } });
    if (!existing) return apiError("Account not found", 404);
    await prisma.account.update({ where: { id: params.id }, data: { isActive: false } });
    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error("[accounts/[id]] DELETE error:", err);
    return apiError("Internal server error", 500);
  }
}
