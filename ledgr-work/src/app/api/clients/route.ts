import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { createClientSchema } from "@/lib/validations/schemas";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const search = request.nextUrl.searchParams.get("search");
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";

    const clients = await prisma.client.findMany({
      where: {
        userId: user.id,
        isActive: includeInactive ? undefined : true,
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { vatNumber: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: { name: "asc" },
    });

    return apiSuccess(clients);
  } catch (err) {
    console.error("[clients] GET error:", err);
    return apiError("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const body = await request.json();
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

    const data = parsed.data;

    const client = await prisma.client.create({
      data: {
        userId: user.id,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        vatNumber: data.vatNumber || null,
        iban: data.iban || null,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        notes: data.notes || null,
      },
    });

    return apiSuccess(client, 201);
  } catch (err) {
    console.error("[clients] POST error:", err);
    return apiError("Internal server error", 500);
  }
}
