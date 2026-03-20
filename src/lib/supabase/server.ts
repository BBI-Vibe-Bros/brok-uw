import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const serviceClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can be ignored in Server Components where cookies are read-only
          }
        },
      },
    }
  );
}

/**
 * Service-role client (auth.admin, RLS bypass, cron). Uses supabase-js — not the SSR helper.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      "[supabase] createServiceClient: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createSupabaseClient(url ?? "", key ?? "", serviceClientOptions);
}

/**
 * Route handlers after `requireAdminAuth`: service role when set; otherwise the signed-in session
 * (works if RLS allows that admin user to access the rows).
 */
export async function createAdminRouteClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) {
    return createSupabaseClient(url, key, serviceClientOptions);
  }
  return (await createClient()) as unknown as SupabaseClient;
}
