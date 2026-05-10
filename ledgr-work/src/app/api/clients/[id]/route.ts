import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { apiError, apiSuccess } from "@/lib/utils/auth";
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

    // Map alleen bestaande kolommen
    if (d.name  !== undefined) updateData.company_name    = d.name;
    if (d.email !== undefined) updateData.email           = d.email || null;

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
      .update({ status: "inactive" })
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
