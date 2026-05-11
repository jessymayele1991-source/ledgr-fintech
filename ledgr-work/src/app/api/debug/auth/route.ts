import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, unknown> = {};

  // 1. Cookies
  const cookieStore = cookies();
  const all = cookieStore.getAll();
  result.cookies = {
    total: all.length,
    names: all.map((c) => c.name),
    authTokenCookies: all
      .filter((c) => c.name.includes("auth-token"))
      .map((c) => ({ name: c.name, valueLength: c.value.length })),
  };

  // 2. supabase.auth.getUser()
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch { /* ignore in Server Components */ }
          },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    result.supabaseAuth = {
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      error: error ? `${error.message} (status=${error.status})` : null,
    };
  } catch (e) {
    result.supabaseAuth = { error: e instanceof Error ? e.message : String(e) };
  }

  return Response.json(result, { status: 200 });
}
