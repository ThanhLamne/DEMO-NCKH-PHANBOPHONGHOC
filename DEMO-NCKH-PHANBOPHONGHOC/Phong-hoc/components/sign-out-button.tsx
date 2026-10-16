"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export function SignOutButton({
  className = "",
  menuItem = false,
}: {
  className?: string
  menuItem?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState("")

  async function signOut() {
    setError("")
    const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
      return
    }
    router.replace("/")
    router.refresh()
  }

  return (
    <div>
      <button
        type="button"
        role={menuItem ? "menuitem" : undefined}
        onClick={signOut}
        className={className}
      >
        <LogOut className="size-4" />
        Đăng xuất
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
