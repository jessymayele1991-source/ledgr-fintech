import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { apiError, apiSuccess } from "@/lib/utils/auth";
import { createClientSchema } from "@/lib/validations/schemas";

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

export async function GET(request: NextRequest) {
  try {
    const supabase = makeSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.error("[clients] auth error:", authError.message);
    if (!user) return apiError("Unauthorized", 401);

    const search = request.nextUrl.searchParams.get("search");
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";

    let query = supabase
      .from("clients")
      .select("*")
      .eq("userId", user.id)
      .order("name", { ascending: true });

    if (!includeInactive) query = query.eq("isActive", true);

    if (search) {
      const s = search.replace(/[%_]/g, "\\$&");
      query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,vatNumber.ilike.%${s}%`);
    }

    const { data: clients, error: dbError } = await query;
    if (dbError) {
      console.error("[clients] query error:", dbError.message);
      return apiError("Internal server error", 500);
    }

    return apiSuccess(clients ?? []);
  } catch (err) {
    console.error("[clients] GET error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = makeSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.error("[clients] auth error:", authError.message);
    if (!user) return apiError("Unauthorized", 401);

    const body = await request.json();
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

    const d = parsed.data;

    const { data: client, error: insertError } = await supabase
      .from("clients")
      .insert({
        userId: user.id,
        name: d.name,
        email: d.email || null,
        phone: d.phone || null,
        vatNumber: d.vatNumber || null,
        iban: d.iban || null,
        address: d.address || null,
        city: d.city || null,
        country: d.country || null,
        notes: d.notes || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[clients] insert error:", insertError.message);
      return apiError("Internal server error", 500);
    }

    return apiSuccess(client, 201);
  } catch (err) {
    console.error("[clients] POST error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}
