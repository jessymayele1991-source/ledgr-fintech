import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { createClientSchema } from "@/lib/validations/schemas";

// Generates a CUID-v1-compatible ID: 'c' + base36 timestamp + hex random = 25 chars.
// Uses crypto.getRandomValues (DOM Crypto API, typed in lib.dom.d.ts, available in
// Node 18+ and all browsers — no import needed). Must supply because Prisma
// @default(cuid()) has no DB-level DEFAULT; Prisma generates it at the app layer.
// The format satisfies z.string().cuid() which is used in transaction/account schemas
// that reference clientId.
function generateId(): string {
  const timestamp = Date.now().toString(36).padStart(8, "0");
  const random = Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (b) => b.toString(16).padStart(2, "0")
  ).join(""); // 16 hex chars
  return ("c" + timestamp + random).slice(0, 25);
}

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
    // getCurrentUser() resolves the Prisma user ID (CUID) — required because
    // clients.userId references users.id (CUID), not auth.users.id (UUID).
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const supabase = makeSupabase();
    const search = request.nextUrl.searchParams.get("search");
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";

    // Column names match the Prisma-generated schema (camelCase, no @map on fields).
    let query = supabase
      .from("clients")
      .select("*")
      .eq("userId", user.id)
      .order("name", { ascending: true });

    if (!includeInactive) query = query.eq("isActive", true);

    if (search) {
      const s = search.replace(/[%_]/g, "\\$&");
      query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,vatNumber.ilike.%${s}%`);
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
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const supabase = makeSupabase();
    const body = await request.json();
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

    const d = parsed.data;

    // id: Prisma @default(cuid()) has no DB-level DEFAULT — must supply it ourselves.
    // updatedAt: Prisma @updatedAt has no DB-level DEFAULT — must supply it ourselves.
    // createdAt: @default(now()) does create a real DB DEFAULT, so omitting it is fine.
    const now = new Date().toISOString();

    const { data: client, error: insertError } = await supabase
      .from("clients")
      .insert({
        id: generateId(),
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
        updatedAt: now,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[clients] POST error:", insertError.message);
      return apiError(insertError.message, 500);
    }

    return apiSuccess(client, 201);
  } catch (err) {
    console.error("[clients] POST error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}
