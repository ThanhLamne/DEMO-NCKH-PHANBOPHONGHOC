import { createClient } from "@supabase/supabase-js"
import { timingSafeEqual } from "node:crypto"

export const runtime = "nodejs"

type SignupRequest = {
  email?: unknown
  password?: unknown
  fullName?: unknown
  inviteCode?: unknown
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 4096) {
    return Response.json({ error: "Dữ liệu đăng ký vượt quá giới hạn." }, { status: 413 })
  }

  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const inviteCode = process.env.ADMIN_INVITE_CODE
  if (!supabaseUrl || !serviceRoleKey || !inviteCode) {
    return Response.json(
      { error: "Máy chủ chưa cấu hình đăng ký quản trị." },
      { status: 503 },
    )
  }

  let body: SignupRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : ""
  const suppliedCode = typeof body.inviteCode === "string" ? body.inviteCode : ""

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12 ||
    password.length > 128 ||
    !fullName ||
    fullName.length > 120 ||
    suppliedCode.length > 512
  ) {
    return Response.json({ error: "Thông tin đăng ký không hợp lệ." }, { status: 400 })
  }

  const expected = Buffer.from(inviteCode)
  const supplied = Buffer.from(suppliedCode)
  if (
    expected.length < 24 ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return Response.json({ error: "Mã mời quản trị không hợp lệ." }, { status: 403 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { portal_role: "admin" },
    user_metadata: { full_name: fullName },
  })

  if (error) {
    const status = /already|registered/i.test(error.message) ? 409 : 400
    return Response.json({ error: error.message }, { status })
  }

  return Response.json({ success: true }, { status: 201 })
}
