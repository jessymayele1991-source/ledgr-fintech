import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { transactionFiltersSchema, createTransactionSchema } from "@/lib/validations/schemas";
import { generateTransactionHash } from "@/lib/accounting/engine";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = transactionFiltersSchema.safeParse(searchParams);

    if (!parsed.success) {
      return apiError("Invalid filters: " + parsed.error.message, 400);
    }

    const f = parsed.data;

    // ─── Build Prisma WHERE clause ──────────────
    const where: Prisma.TransactionWhereInput = {
      userId: user.id,
    };

    if (f.dateFrom) {
      where.date = { ...(where.date as object), gte: new Date(f.dateFrom) };
    }
    if (f.dateTo) {
      where.date = { ...(where.date as object), lte: new Date(f.dateTo) };
    }

    if (f.amountMin !== undefined) {
      where.amount = { ...(where.amount as object), gte: f.amountMin };
    }
    if (f.amountMax !== undefined) {
      where.amount = { ...(where.amount as object), lte: f.amountMax };
    }

    if (f.type && f.type !== "ALL") {
      where.type = f.type;
    } else if (!f.includeTransfers) {
      where.type = { notIn: ["TRANSFER"] };
    }

    if (f.categoryId) {
      where.categoryId = f.categoryId;
    }
    if (f.accountId) {
      where.accountId = f.accountId;
    }
    if (f.clientId) {
      where.clientId = f.clientId;
    }

    if (f.search) {
      where.OR = [
        { description: { contains: f.search, mode: "insensitive" } },
        { counterpartyName: { contains: f.search, mode: "insensitive" } },
        { counterpartyIban: { contains: f.search, mode: "insensitive" } },
        { reference: { contains: f.search, mode: "insensitive" } },
        { notes: { contains: f.search, mode: "insensitive" } },
      ];
    }

    // ─── Sorting ────────────────────────────────
    const orderBy: Prisma.TransactionOrderByWithRelationInput = {};
    if (f.sortBy === "date") orderBy.date = f.sortOrder;
    else if (f.sortBy === "amount") orderBy.amount = f.sortOrder;
    else if (f.sortBy === "description") orderBy.description = f.sortOrder;
    else orderBy.date = "desc";

    // ─── Count + Paginate ────────────────────────
    const [total, items] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: {
          category: true,
          client: { select: { id: true, name: true } },
          account: { select: { id: true, name: true, currency: true } },
        },
        orderBy,
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ]);

    // Convert Prisma Decimal to number
    const serialized = items.map(serializeTransaction);

    return apiSuccess({
      items: serialized,
      total,
      page: f.page,
      pageSize: f.pageSize,
      totalPages: Math.ceil(total / f.pageSize),
    });
  } catch (err) {
    console.error("[transactions] GET error:", err);
    return apiError("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const body = await request.json();
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("Validation error: " + parsed.error.message, 400);
    }

    const data = parsed.data;

    // Generate hash for dedup
    const hash = generateTransactionHash({
      date: new Date(data.date),
      signedAmount: data.signedAmount,
      currency: data.currency,
      counterpartyIban: data.counterpartyIban ?? null,
      reference: data.reference ?? null,
    });

    // Check for duplicate
    const existing = await prisma.transaction.findUnique({
      where: { userId_transactionHash: { userId: user.id, transactionHash: hash } },
    });

    if (existing) {
      return apiError("Duplicate transaction", 409, "DUPLICATE");
    }

    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        date: new Date(data.date),
        amount: data.amount,
        signedAmount: data.signedAmount,
        currency: data.currency,
        type: data.type,
        categoryId: data.categoryId ?? null,
        clientId: data.clientId ?? null,
        accountId: data.accountId ?? null,
        counterpartyName: data.counterpartyName ?? null,
        counterpartyIban: data.counterpartyIban ?? null,
        description: data.description ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        transactionHash: hash,
        isManual: true,
      },
      include: {
        category: true,
        client: { select: { id: true, name: true } },
        account: { select: { id: true, name: true, currency: true } },
      },
    });

    return apiSuccess(serializeTransaction(tx), 201);
  } catch (err) {
    console.error("[transactions] POST error:", err);
    return apiError("Internal server error", 500);
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function serializeTransaction(tx: Record<string, unknown>): Record<string, unknown> {
  return {
    ...tx,
    amount: Number(tx.amount),
    signedAmount: Number(tx.signedAmount),
    date: tx.date instanceof Date ? tx.date.toISOString() : tx.date,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
    updatedAt: tx.updatedAt instanceof Date ? tx.updatedAt.toISOString() : tx.updatedAt,
  };
}
