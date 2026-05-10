import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { apiError, apiSuccess } from "@/lib/utils/auth";
import { createClientSchema } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

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
      .eq("user_id", user.id)
      .order("company_name", { ascending: true });

    if (!includeInactive) query = query.neq("status", "inactive");

    if (search) {
      const s = search.replace(/[%_]/g, "\\$&");
      query = query.or(`company_name.ilike.%${s}%,contact_person.ilike.%${s}%,email.ilike.%${s}%`);
    }

    const { data: clients, error: dbError } = await query;
    if (dbError) {
      console.error("[clients] GET error:", dbError.message);
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
        user_id: user.id,
        company_name: d.name,
        email: d.email || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[clients] POST error:", insertError.message);
      return apiError("Internal server error", 500);
    }

    return apiSuccess(client, 201);
  } catch (err) {
    console.error("[clients] POST error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}
