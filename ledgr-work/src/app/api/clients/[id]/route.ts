import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { apiError, apiSuccess } from "@/lib/utils/auth";
import { updateClientSchema } from "@/lib/validations/schemas";

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
    const supabase = makeSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.error("[clients/[id]] auth error:", authError.message);
    if (!user) return apiError("Unauthorized", 401);

    const { data: client, error: dbError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (dbError || !client) return apiError("Client not found", 404);

    const { count } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("client_id", params.id)
      .eq("user_id", user.id);

    return apiSuccess({ ...client, _count: { transactions: count ?? 0 } });
  } catch (err) {
    console.error("[clients/[id]] GET error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const supabase = makeSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.error("[clients/[id]] auth error:", authError.message);
    if (!user) return apiError("Unauthorized", 401);

    const body = await request.json();
    const parsed = updateClientSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

    const d = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (d.name      !== undefined) updateData.name       = d.name;
    if (d.email     !== undefined) updateData.email      = d.email     || null;
    if (d.phone     !== undefined) updateData.phone      = d.phone     || null;
    if (d.vatNumber !== undefined) updateData.vat_number = d.vatNumber || null;
    if (d.iban      !== undefined) updateData.iban       = d.iban      || null;
    if (d.address   !== undefined) updateData.address    = d.address   || null;
    if (d.city      !== undefined) updateData.city       = d.city      || null;
    if (d.country   !== undefined) updateData.country    = d.country   || null;
    if (d.notes     !== undefined) updateData.notes      = d.notes     || null;
    if (d.isActive  !== undefined) updateData.is_active  = d.isActive;

    const { data: updated, error: updateError } = await supabase
      .from("clients")
      .update(updateData)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error("[clients/[id]] PATCH error:", updateError?.message);
      return apiError("Client not found", 404);
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error("[clients/[id]] PATCH error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const supabase = makeSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.error("[clients/[id]] auth error:", authError.message);
    if (!user) return apiError("Unauthorized", 401);

    const { error: updateError } = await supabase
      .from("clients")
      .update({ is_active: false })
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[clients/[id]] DELETE error:", updateError.message);
      return apiError("Client not found", 404);
    }

    return apiSuccess({ deleted: true, id: params.id });
  } catch (err) {
    console.error("[clients/[id]] DELETE error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}
