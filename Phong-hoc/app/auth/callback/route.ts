import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseConfig } from "@/lib/supabase/config"

const ALLOWED_DESTINATIONS = new Set(["/student", "/lecturer", "/admin"])

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const destination = request.nextUrl.searchParams.get("next") ?? "/"

  if (!code || !ALLOWED_DESTINATIONS.has(destination)) {
    return new Response("Liên kết xác nhận không hợp lệ hoặc đã hết hạn.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  if (!getSupabaseConfig()) {
    return new Response("Hệ thống đăng nhập chưa được cấu hình.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return new Response("Không thể xác nhận tài khoản. Hãy đăng ký lại hoặc đăng nhập.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  return NextResponse.redirect(new URL(destination, request.url))
}
