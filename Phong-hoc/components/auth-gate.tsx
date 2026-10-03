"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  UserRound,
} from "lucide-react";

type AuthRole = "admin" | "lecturer" | "student";

type AuthConfig = {
  title: string;
  subtitle: string;
  description: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  demoUsername: string;
  demoPassword: string;
  icon: typeof ShieldCheck;
  accent: string;
};

const AUTH_CONFIG: Record<AuthRole, AuthConfig> = {
  admin: {
    title: "Đăng nhập quản trị",
    subtitle: "Cổng quản trị hệ thống phòng học",
    description: "Đăng nhập để quản lý thời khóa biểu, phòng học và phân bổ phòng.",
    usernameLabel: "Tên tài khoản quản trị",
    usernamePlaceholder: "admin@apag.edu.vn",
    demoUsername: "admin",
    demoPassword: "admin123",
    icon: ShieldCheck,
    accent: "from-blue-600 to-indigo-700",
  },
  lecturer: {
    title: "Đăng nhập giảng viên",
    subtitle: "Cổng dành cho giảng viên",
    description: "Đăng nhập để tra cứu phòng và gửi yêu cầu mượn phòng.",
    usernameLabel: "Mã giảng viên hoặc email",
    usernamePlaceholder: "gv001 hoặc lecturer@apag.edu.vn",
    demoUsername: "gv001",
    demoPassword: "gv123456",
    icon: GraduationCap,
    accent: "from-emerald-600 to-teal-700",
  },
  student: {
    title: "Đăng nhập sinh viên",
    subtitle: "Cổng dành cho sinh viên",
    description: "Đăng nhập để tra cứu trạng thái phòng và đăng ký mượn phòng.",
    usernameLabel: "Mã sinh viên hoặc email",
    usernamePlaceholder: "sv001 hoặc student@apag.edu.vn",
    demoUsername: "sv001",
    demoPassword: "sv123456",
    icon: GraduationCap,
    accent: "from-violet-600 to-purple-700",
  },
};

const SESSION_PREFIX = "apag-auth-session-";

export function AuthGate({
  role,
  children,
}: {
  role: AuthRole;
  children: React.ReactNode;
}) {
  const config = AUTH_CONFIG[role];
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthenticated(window.sessionStorage.getItem(`${SESSION_PREFIX}${role}`) === "1");
    setReady(true);
  }, [role]);

  if (!ready) {
    return <div className="min-h-screen bg-slate-100" aria-busy="true" />;
  }

  if (authenticated) return <>{children}</>;

  return (
    <LoginPage
      role={role}
      config={config}
      onSuccess={() => setAuthenticated(true)}
    />
  );
}

function LoginPage({
  role,
  config,
  onSuccess,
}: {
  role: AuthRole;
  config: AuthConfig;
  onSuccess: () => void;
}) {
  const Icon = config.icon;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const normalizedUsername = username.trim().toLowerCase();
    const valid =
      normalizedUsername === config.demoUsername &&
      password === config.demoPassword;

    window.setTimeout(() => {
      if (!valid) {
        setError("Tên tài khoản hoặc mật khẩu không đúng.");
        setIsSubmitting(false);
        return;
      }
      window.sessionStorage.setItem(`${SESSION_PREFIX}${role}`, "1");
      onSuccess();
    }, 250);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 py-10">
      <div className={`absolute inset-0 bg-gradient-to-br ${config.accent} opacity-10`} />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
        <section className={`hidden bg-gradient-to-br ${config.accent} p-10 text-white md:flex md:flex-col md:justify-between`}>
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-white/15">
                <Building2 className="size-6" />
              </div>
              <span className="text-lg font-bold tracking-wide">APAG</span>
            </div>
            <div className="mt-20">
              <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-white/15">
                <Icon className="size-8" />
              </div>
              <h1 className="text-3xl font-bold leading-tight">{config.title}</h1>
              <p className="mt-4 text-sm leading-6 text-white/80">{config.description}</p>
            </div>
          </div>
          <p className="text-xs text-white/70">
            Học viện Hành chính &amp; Quản trị Công
          </p>
        </section>

        <section className="p-6 sm:p-10">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" /> Về trang chọn cổng
          </Link>
          <div className="mt-10">
            <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 md:hidden">
              <Icon className="size-6" />
            </div>
            <p className="text-sm font-semibold text-slate-500">{config.subtitle}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Chào mừng trở lại</h2>
            <p className="mt-2 text-sm text-slate-500">Vui lòng nhập thông tin để tiếp tục.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block text-sm font-semibold text-slate-700">
              {config.usernameLabel}
              <div className="relative mt-2">
                <UserRound className="pointer-events-none absolute left-3 top-3 size-5 text-slate-400" />
                <input
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={config.usernamePlaceholder}
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Mật khẩu
              <div className="relative mt-2">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3 size-5 text-slate-400" />
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-11 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </label>

            {error && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${config.accent} px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70`}
            >
              <LogIn className="size-5" />
              {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
            <strong>Tài khoản demo:</strong> {config.demoUsername} / {config.demoPassword}
          </div>
        </section>
      </div>
    </main>
  );
}
