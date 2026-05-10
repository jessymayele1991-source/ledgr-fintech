import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { updateTransactionSchema } from "@/lib/validations/schemas";

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const tx = await prisma.transaction.findFirst({
      where: { id: params.id, userId: user.id },
      include: {
        category: true,
        client: true,
        account: true,
      },
    });

    if (!tx) return apiError("Transaction not found", 404);

    return apiSuccess(serializeTx(tx));
  } catch (err) {
    console.error("[transactions/[id]] GET error:", err);
    return apiError("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const existing = await prisma.transaction.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) return apiError("Transaction not found", 404);

    const body = await request.json();
    const parsed = updateTransactionSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

    const data = parsed.data;

    const updated = await prisma.transaction.update({
      where: { id: params.id },
      data: {
        ...(data.date && { date: new Date(data.date) }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.signedAmount !== undefined && { signedAmount: data.signedAmount }),
        ...(data.currency && { currency: data.currency }),
        ...(data.type && { type: data.type }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.clientId !== undefined && { clientId: data.clientId }),
        ...(data.accountId !== undefined && { accountId: data.accountId }),
        ...(data.counterpartyName !== undefined && { counterpartyName: data.counterpartyName }),
        ...(data.counterpartyIban !== undefined && { counterpartyIban: data.counterpartyIban }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.reference !== undefined && { reference: data.reference }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isReconciled !== undefined && { isReconciled: data.isReconciled }),
      },
      include: {
        category: true,
        client: { select: { id: true, name: true } },
        account: { select: { id: true, name: true, currency: true } },
      },
    });

    return apiSuccess(serializeTx(updated));
  } catch (err) {
    console.error("[transactions/[id]] PATCH error:", err);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const existing = await prisma.transaction.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) return apiError("Transaction not found", 404);

    await prisma.transaction.delete({ where: { id: params.id } });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error("[transactions/[id]] DELETE error:", err);
    return apiError("Internal server error", 500);
  }
}

function serializeTx(tx: Record<string, unknown>): Record<string, unknown> {
  return {
    ...tx,
    amount: Number(tx.amount),
    signedAmount: Number(tx.signedAmount),
    date: tx.date instanceof Date ? tx.date.toISOString() : tx.date,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
    updatedAt: tx.updatedAt instanceof Date ? tx.updatedAt.toISOString() : tx.updatedAt,
  };
}
