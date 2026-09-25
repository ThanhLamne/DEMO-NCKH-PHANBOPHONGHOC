import Link from "next/link"
import { ArrowRight, BookOpen, Building2, GraduationCap, ShieldCheck } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export default function Page() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-100 via-background to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="fixed right-5 top-5 z-10">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-10 md:px-8">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Building2 className="size-7" />
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Học viện Hành chính &amp; Quản trị Công
          </p>
          <h1 className="mt-2 text-balance text-2xl font-bold text-foreground md:text-3xl">
            Hệ thống quản lý phòng học
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Chọn khu vực phù hợp để quản lý lịch phòng hoặc tra cứu và mượn phòng.
          </p>
        </header>

        <main className="grid gap-4 md:grid-cols-3">
          <RoleCard
            href="/student"
            icon={<GraduationCap className="size-6" />}
            title="Cổng sinh viên"
            description="Xem trạng thái phòng theo thời gian thực và đăng ký mượn phòng trống."
            action="Tra cứu phòng"
          />
          <RoleCard
            href="/admin"
            icon={<ShieldCheck className="size-6" />}
            title="Cổng quản trị"
            description="Thêm lớp học, tự động phân bổ phòng và theo dõi thời khóa biểu."
            action="Mở quản trị"
          />
          <RoleCard
            href="/lecturer"
            icon={<BookOpen className="size-6" />}
            title="Cổng giảng viên"
            description="Tra cứu phòng trống và gửi yêu cầu mượn phòng để quản trị viên phê duyệt."
            action="Mở cổng giảng viên"
          />
        </main>
      </div>
    </div>
  )
}

function RoleCard({
  href,
  icon,
  title,
  description,
  action,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  action: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-white/70 bg-white/70 p-6 shadow-[0_8px_30px_rgb(15,23,42,0.06)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-white/10 dark:hover:border-white/20"
    >
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{description}</p>
      <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary">
        {action}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  )
}
