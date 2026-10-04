import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseConfig } from "./config"

export async function createSupabaseServerClient() {
  const config = getSupabaseConfig()
  if (!config) throw new Error("Supabase chưa được cấu hình.")

  const cookieStore = await cookies()

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Middleware refreshes cookies when server components cannot write them.
        }
      },
    },
  })
}
