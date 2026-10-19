"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { LogOut } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export function SignOutButton({
  className = "",
  menuItem = false,
  redirectTo = "/",
  label = "Đăng xuất",
  autoSignOut = false,
}: {
  className?: string
  menuItem?: boolean
  redirectTo?: string
  label?: string
  autoSignOut?: boolean
}) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const autoSignOutStarted = useRef(false)

  const signOut = useCallback(async () => {
    setError("")
    setBusy(true)
    try {
      const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut()
      if (signOutError) {
        setError(signOutError.message)
        setBusy(false)
        return
      }
      window.location.replace(redirectTo)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể đăng xuất. Vui lòng thử lại.")
      setBusy(false)
    }
  }, [redirectTo])

  useEffect(() => {
    if (!autoSignOut || autoSignOutStarted.current) return
    autoSignOutStarted.current = true
    void signOut()
  }, [autoSignOut, signOut])

  return (
    <div>
      <button
        type="button"
        role={menuItem ? "menuitem" : undefined}
        onClick={signOut}
        disabled={busy}
        className={className}
      >
        <LogOut className="size-4" />
        {busy
          ? "Đang đăng xuất tài khoản cũ..."
          : error && autoSignOut
            ? "Thử đăng xuất lại"
            : label}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
