import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { updateClientSchema } from "@/lib/validations/schemas";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const client = await prisma.client.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      _count: { select: { transactions: true } },
    },
  });

  if (!client) return apiError("Client not found", 404);
  return apiSuccess(client);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const existing = await prisma.client.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) return apiError("Client not found", 404);

  const body = await request.json();
  const parsed = updateClientSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

  const updated = await prisma.client.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      vatNumber: parsed.data.vatNumber || null,
      iban: parsed.data.iban || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      country: parsed.data.country || null,
      notes: parsed.data.notes || null,
    },
  });

  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const existing = await prisma.client.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) return apiError("Client not found", 404);

  // Soft delete
  const updated = await prisma.client.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return apiSuccess({ deleted: true, id: params.id });
}
