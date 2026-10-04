"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Building2, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import type { PortalRole } from "@/components/portal-auth"

const PORTAL_INFO: Record<PortalRole, { title: string; subtitle: string }> = {
  admin: { title: "Cổng quản trị", subtitle: "Đăng nhập hoặc đăng ký bằng mã mời quản trị." },
  lecturer: { title: "Cổng giảng viên", subtitle: "Đăng nhập hoặc tạo tài khoản giảng viên." },
  student: { title: "Cổng sinh viên", subtitle: "Đăng nhập hoặc tạo tài khoản sinh viên." },
}

function authErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const authError = error as { code?: unknown; status?: unknown; message?: unknown }
    const code = typeof authError.code === "string" ? authError.code : ""
    const message = typeof authError.message === "string" ? authError.message : ""
    if (
      code.includes("rate_limit") ||
      authError.status === 429 ||
      /rate.?limit|too many requests/i.test(message)
    ) {
      return "Supabase đã giới hạn gửi email xác nhận. Đừng gửi lại liên tục; hãy kiểm tra hộp thư và mục Spam, rồi thử lại sau khi giới hạn được làm mới. Email mặc định của Supabase thường chỉ gửi tối đa 2 thư/giờ; để dùng thật cần cấu hình SMTP riêng."
    }
    if (code === "email_not_confirmed") {
      return "Email chưa được xác nhận. Hãy mở thư xác nhận trong hộp thư (kiểm tra cả mục Spam) rồi đăng nhập lại."
    }
    if (code === "invalid_credentials") {
      return "Email hoặc mật khẩu không đúng. Nếu vừa đăng ký, hãy xác nhận email trước khi đăng nhập."
    }
    if (message) return message
  }

  return "Đã xảy ra lỗi khi xác thực. Vui lòng thử lại."
}

export function AuthForm({ role }: { role: PortalRole }) {
  const router = useRouter()
  const [registering, setRegistering] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const info = PORTAL_INFO[role]

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setNotice("")
    setBusy(true)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim().toLowerCase()
    const password = String(formData.get("password") ?? "")

    try {
      if (registering && role === "admin") {
        const response = await fetch("/api/auth/admin-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            fullName: String(formData.get("fullName") ?? "").trim(),
            inviteCode: String(formData.get("inviteCode") ?? ""),
          }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "Không thể tạo tài khoản quản trị.")
        const supabase = createSupabaseBrowserClient()
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          setNotice("Tài khoản quản trị đã tạo. Hãy đăng nhập bằng email và mật khẩu vừa đăng ký.")
          setRegistering(false)
        } else {
          router.refresh()
        }
      } else if (registering) {
        const supabase = createSupabaseBrowserClient()
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: String(formData.get("fullName") ?? "").trim(),
              portal_role: role,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/${role}`,
          },
        })
        if (signUpError) throw signUpError
        if (data.session) {
          router.refresh()
        } else {
          setNotice("Đã tạo tài khoản. Hãy mở email xác nhận trước khi đăng nhập.")
          setRegistering(false)
        }
      } else {
        const supabase = createSupabaseBrowserClient()
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        router.refresh()
      }
    } catch (cause) {
      setError(authErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-sky-100 px-4 py-10">
      <section
        translate="no"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.14)]"
      >
        <div className="bg-gradient-to-r from-slate-900 to-blue-800 px-7 py-8 text-white">
          <Link href="/" className="mb-7 inline-flex items-center gap-2 text-sm text-blue-100 hover:text-white">
            <ArrowLeft className="size-4" /> Trang chủ
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
              <Building2 className="size-6" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-blue-100">Học viện Hành chính &amp; Quản trị Công</p>
              <h1 className="mt-1 text-2xl font-bold">{info.title}</h1>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-blue-100">{info.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-7">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{registering ? "Tạo tài khoản" : "Đăng nhập"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {registering ? "Tài khoản được lưu an toàn trên Supabase." : "Dùng email và mật khẩu đã đăng ký."}
            </p>
          </div>

          {registering && (
            <Field label="Họ và tên">
              <input name="fullName" autoComplete="name" required maxLength={120} className={inputClass} />
            </Field>
          )}
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" required maxLength={254} className={inputClass} />
          </Field>
          <Field label="Mật khẩu">
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={registering ? "new-password" : "current-password"}
                required
                minLength={registering ? 12 : 1}
                maxLength={128}
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-900"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {registering && <p className="mt-1 text-xs text-slate-500">Mật khẩu cần ít nhất 12 ký tự.</p>}
          </Field>
          {registering && role === "admin" && (
            <Field label="Mã mời quản trị">
              <>
                <input name="inviteCode" type="password" required minLength={24} maxLength={512} autoComplete="off" className={inputClass} />
                <span className="block text-xs font-normal text-slate-500">
                  Mã do quản trị viên cấp, tối thiểu 24 ký tự.
                </span>
              </>
            </Field>
          )}

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
          >
            <LoaderCircle
              aria-hidden="true"
              className={`size-4 animate-spin ${busy ? "" : "hidden"}`}
            />
            <ShieldCheck
              aria-hidden="true"
              className={`size-4 ${busy ? "hidden" : ""}`}
            />
            <span>{registering ? "Tạo tài khoản" : "Đăng nhập"}</span>
          </button>

          <p className="text-center text-sm text-slate-600">
            {registering ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <button
              type="button"
              onClick={() => { setRegistering((value) => !value); setError(""); setNotice("") }}
              className="font-bold text-blue-700 hover:underline"
            >
              {registering ? "Đăng nhập" : "Đăng ký"}
            </button>
          </p>
        </form>
      </section>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  )
}

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
