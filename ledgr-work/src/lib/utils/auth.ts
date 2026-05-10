import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@/types";

export async function createSupabaseServerClient(request?: NextRequest) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request?.cookies.getAll() ?? cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (err) {
            console.warn("[auth] unable to persist refreshed Supabase cookies:", err);
          }
        },
      },
    }
  );
}

export async function getCurrentUser(request?: NextRequest): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) console.error("[auth] getUser error:", error.message);
    if (!user) return null;

    const dbUser = await prisma.user.upsert({
      where: { supabaseId: user.id },
      update: {
        email: user.email!,
        name: user.user_metadata?.name ?? null,
      },
      create: {
        supabaseId: user.id,
        email: user.email!,
        name: user.user_metadata?.name ?? null,
      },
    });

    return dbUser as User;
  } catch (err) {
    console.error("[auth] getCurrentUser error:", err);
    return null;
  }
}

export function apiError(message: string, status: number = 400, code?: string) {
  return Response.json({ data: null, error: { message, code } }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200) {
  return Response.json({ data, error: null }, { status });
}
