import Link from "next/link"
import { Building2, CircleAlert, ShieldCheck } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { AuthForm } from "@/components/portal-auth-form"
import { SignOutButton } from "@/components/sign-out-button"

export type PortalRole = "admin" | "lecturer" | "student"

const ROLE_LABELS: Record<PortalRole, string> = {
  admin: "quản trị viên",
  lecturer: "giảng viên",
  student: "sinh viên",
}

export async function PortalAuth({
  role,
  children,
}: {
  role: PortalRole
  children: React.ReactNode
}) {
  if (!getSupabaseConfig()) {
    return (
      <AuthMessage
        title="Cần cấu hình dịch vụ đăng nhập"
        message="Hệ thống chưa được nối với Supabase. Hãy cấu hình các biến NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY theo hướng dẫn trong README."
      />
    )
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) {
    return (
      <AuthMessage
        title="Không thể đọc phiên đăng nhập"
        message={sessionError.message}
      />
    )
  }

  if (!session) return <AuthForm role={role} />

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return (
      <AuthMessage
        title="Không thể xác thực phiên đăng nhập"
        message={userError?.message ?? "Phiên đăng nhập hết hạn. Hãy đăng nhập lại."}
        action={<SignOutButton />}
      />
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    return (
      <AuthMessage
        title="Không thể kiểm tra quyền tài khoản"
        message="Hãy xác nhận schema Supabase đã được cài đặt theo Phong-hoc/supabase/schema.sql."
      />
    )
  }

  if (!profile || profile.role !== role) {
    return (
      <AuthMessage
        title="Tài khoản không có quyền vào cổng này"
        message={`Tài khoản hiện tại không được cấp quyền ${ROLE_LABELS[role]}. Hãy đăng xuất và chọn đúng cổng.`}
        action={<SignOutButton />}
      />
    )
  }

  return children
}

function AuthMessage({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <Building2 className="size-5" />
          Hệ thống quản lý phòng học
        </Link>
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <CircleAlert className="size-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {action && <div className="mt-5">{action}</div>}
        <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <ShieldCheck className="size-4" />
          Quyền truy cập được xác minh từ tài khoản Supabase.
        </div>
      </section>
    </main>
  )
}
