import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@/types";

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // No-op in API routes — middleware handles session refresh
          },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) console.error("[auth] getUser error:", error.message);
    if (!user) return null;

    const email = user.email;
    if (!email) {
      console.error("[auth] Supabase user missing email:", user.id);
      return null;
    }

    try {
      const dbUser = await prisma.user.upsert({
        where: { supabaseId: user.id },
        update: {
          email,
          name: user.user_metadata?.name ?? null,
        },
        create: {
          supabaseId: user.id,
          email,
          name: user.user_metadata?.name ?? null,
        },
      });
      return dbUser as User;
    } catch (prismaErr) {
      // Upsert can fail on email unique constraint if same email exists
      // under a different supabaseId — fall back to find-then-update.
      console.error("[auth] upsert failed:", prismaErr instanceof Error ? prismaErr.message : String(prismaErr));
      const existing = await prisma.user.findFirst({ where: { email } });
      if (existing) {
        return await prisma.user.update({
          where: { id: existing.id },
          data: { supabaseId: user.id, name: user.user_metadata?.name ?? null },
        }) as User;
      }
      return null;
    }
  } catch (err) {
    console.error("[auth] getCurrentUser error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export function apiError(message: string, status: number = 400, code?: string) {
  return Response.json({ data: null, error: { message, code } }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200) {
  return Response.json({ data, error: null }, { status });
}
