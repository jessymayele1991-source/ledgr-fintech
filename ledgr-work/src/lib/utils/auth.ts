import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@/types";

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
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
}

export function apiError(message: string, status: number = 400, code?: string) {
  return Response.json({ data: null, error: { message, code } }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200) {
  return Response.json({ data, error: null }, { status });
}
