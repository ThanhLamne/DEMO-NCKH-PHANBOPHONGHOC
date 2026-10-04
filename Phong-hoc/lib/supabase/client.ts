"use client"

import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseConfig } from "./config"

export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig()
  if (!config) throw new Error("Supabase chưa được cấu hình.")

  return createBrowserClient(config.url, config.anonKey)
}
