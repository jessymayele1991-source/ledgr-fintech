import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { updateClientSchema } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

function makeSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const supabase = makeSupabase();

    const { data: client, error: dbError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", params.id)
      .eq("userId", user.id)
      .single();

    if (dbError || !client) return apiError("Client not found", 404);

    // Count related transactions using correct Prisma-generated column names.
    const { count } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("clientId", params.id)
      .eq("userId", user.id);

    return apiSuccess({ ...client, _count: { transactions: count ?? 0 } });
  } catch (err) {
    console.error("[clients/[id]] GET error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const supabase = makeSupabase();
    const body = await request.json();
    const parsed = updateClientSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

    const d = parsed.data;
    // updatedAt has no DB-level DEFAULT (@updatedAt is Prisma app-layer only) — set it on every write.
    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    // Map every client field to its Prisma-generated column name.
    if (d.name      !== undefined) updateData.name      = d.name;
    if (d.email     !== undefined) updateData.email     = d.email     || null;
    if (d.phone     !== undefined) updateData.phone     = d.phone     || null;
    if (d.vatNumber !== undefined) updateData.vatNumber = d.vatNumber || null;
    if (d.iban      !== undefined) updateData.iban      = d.iban      || null;
    if (d.address   !== undefined) updateData.address   = d.address   || null;
    if (d.city      !== undefined) updateData.city      = d.city      || null;
    if (d.country   !== undefined) updateData.country   = d.country   || null;
    if (d.notes     !== undefined) updateData.notes     = d.notes     || null;
    if (d.isActive  !== undefined) updateData.isActive  = d.isActive;

    const { data: updated, error: updateError } = await supabase
      .from("clients")
      .update(updateData)
      .eq("id", params.id)
      .eq("userId", user.id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error("[clients/[id]] PATCH error:", updateError?.message);
      return apiError(updateError?.message ?? "Client not found", 404);
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error("[clients/[id]] PATCH error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const supabase = makeSupabase();

    // Soft-delete: set isActive = false. Also set updatedAt — no DB-level default for @updatedAt.
    const { error: updateError } = await supabase
      .from("clients")
      .update({ isActive: false, updatedAt: new Date().toISOString() })
      .eq("id", params.id)
      .eq("userId", user.id);

    if (updateError) {
      console.error("[clients/[id]] DELETE error:", updateError.message);
      return apiError(updateError.message, 500);
    }

    return apiSuccess({ deleted: true, id: params.id });
  } catch (err) {
    console.error("[clients/[id]] DELETE error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}
