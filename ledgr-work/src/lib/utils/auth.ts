import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@/types";

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        cookie: cookieStore.toString(),
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  // Upsert user in our DB
  const user = await prisma.user.upsert({
    where: { supabaseId: session.user.id },
    update: {
      email: session.user.email!,
      name: session.user.user_metadata?.name ?? null,
    },
    create: {
      supabaseId: session.user.id,
      email: session.user.email!,
      name: session.user.user_metadata?.name ?? null,
    },
  });

  return user as User;
}

export function apiError(message: string, status: number = 400, code?: string) {
  return Response.json({ data: null, error: { message, code } }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200) {
  return Response.json({ data, error: null }, { status });
}
