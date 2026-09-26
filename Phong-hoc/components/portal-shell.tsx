"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  BookOpen,
  Building2,
  CalendarCheck2,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  FileWarning,
  Grid2x2,
  History,
  Home,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { BorrowHistoryPanel } from "@/components/borrow-history-panel"
import { BorrowRoomPanel } from "@/components/borrow-room-panel"
import { EquipmentExplorer } from "@/components/equipment-explorer"
import { LecturerIncidentPanel } from "@/components/lecturer-incident-panel"
import { RoomManagementPanel } from "@/components/room-management-panel"
import { SHEET_CLASSES, SHEET_ROOMS } from "@/lib/schedule-data"
import { autoSchedule } from "@/lib/scheduling"
import { INCIDENTS_UPDATED_EVENT, loadIncidents } from "@/lib/incident-store"
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  loadBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store"

type AdminPanel = "home" | "scheduler" | "rooms" | "equipment" | "borrow" | "stats" | "settings"

export function PortalShell({
  role,
  children,
}: {
  role: "admin" | "student" | "lecturer"
  children?: React.ReactNode
}) {
  const isAdmin = role === "admin"
  const isLecturer = role === "lecturer"
  const [activePanel, setActivePanel] = useState<AdminPanel>("home")
  const [activeTab, setActiveTab] = useState<"register" | "history" | "incidents">("register")
  const [now, setNow] = useState<Date | null>(null)
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([])
  const [openIncidentCount, setOpenIncidentCount] = useState(0)

  useEffect(() => {
    if (!isAdmin) return
    setNow(new Date())
    const intervalId = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(intervalId)
  }, [isAdmin])

  useEffect(() => {
    if (!isLecturer) return
    const refreshIncidents = () => setOpenIncidentCount(loadIncidents().filter((incident) => incident.status !== "resolved").length)
    refreshIncidents()
    window.addEventListener(INCIDENTS_UPDATED_EVENT, refreshIncidents)
    window.addEventListener("storage", refreshIncidents)
    return () => {
      window.removeEventListener(INCIDENTS_UPDATED_EVENT, refreshIncidents)
      window.removeEventListener("storage", refreshIncidents)
    }
  }, [isLecturer])

  useEffect(() => {
    if (!isAdmin) return
    const refreshBorrowRequests = () => setBorrowRequests(loadBorrowRequests())
    refreshBorrowRequests()
    window.addEventListener(BORROW_REQUESTS_UPDATED_EVENT, refreshBorrowRequests)
    window.addEventListener("storage", refreshBorrowRequests)
    return () => {
      window.removeEventListener(BORROW_REQUESTS_UPDATED_EVENT, refreshBorrowRequests)
      window.removeEventListener("storage", refreshBorrowRequests)
    }
  }, [isAdmin])

  const liveSchedule = useMemo(() => autoSchedule(SHEET_CLASSES, SHEET_ROOMS), [])
  const formatNumber = (value: number) => new Intl.NumberFormat("vi-VN").format(value)
  const currentDate = now
    ? new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(now)
    : "Đang cập nhật..."
  const currentTime = now
    ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now)
    : "--:--:--"
  const totalStudents = SHEET_CLASSES.reduce((sum, item) => sum + item.size, 0)
  const allocationRate = SHEET_CLASSES.length
    ? Math.round((liveSchedule.assignments.length / SHEET_CLASSES.length) * 100)
    : 0

  if (isAdmin) {
    const menuItems = [
      { key: "home", label: "Trang chủ", icon: Home },
      { key: "scheduler", label: "Phân bổ phòng học", icon: CalendarCheck2 },
      { key: "rooms", label: "Quản lý phòng học", icon: Building2 },
      { key: "equipment", label: "Quản lý thiết bị", icon: ClipboardList },
      { key: "borrow", label: "Đăng ký mượn phòng", icon: BookOpen },
      { key: "stats", label: "Thống kê", icon: LayoutDashboard },
      { key: "settings", label: "Cài đặt", icon: Settings },
    ] as const

    const statCards = [
      { label: "Phòng học thực tế", value: formatNumber(SHEET_ROOMS.length), color: "bg-[#EAF4FF] text-[#2A6FD8]" },
      { label: "Lớp trong TKB", value: formatNumber(SHEET_CLASSES.length), color: "bg-[#EAFBF4] text-[#1AA56C]" },
      { label: "Tổng sĩ số TKB", value: formatNumber(totalStudents), color: "bg-[#F4ECFF] text-[#8157D6]" },
      { label: "Tỷ lệ đã phân phòng", value: `${allocationRate}%`, color: "bg-[#EAF9F6] text-[#0FAF9F]" },
    ]

    const functionCards = [
      {
        key: "scheduler",
        title: "Phân bổ phòng học",
        desc: "Xem và thực hiện phân bổ phòng theo TKB",
        icon: CalendarCheck2,
        tone: "bg-[#EAF5FF] text-[#2A6FD8]",
      },
      {
        key: "rooms",
        title: "Quản lý phòng học",
        desc: "Xem danh sách, tình trạng các phòng học",
        icon: Building2,
        tone: "bg-[#EAFBF4] text-[#1AA56C]",
      },
      {
        key: "equipment",
        title: "Quản lý thiết bị",
        desc: "Theo dõi và quản lý thiết bị phòng học",
        icon: ClipboardList,
        tone: "bg-[#F3EBFF] text-[#8157D6]",
      },
      {
        key: "borrow",
        title: "Đăng ký mượn phòng",
        desc: "Xử lý yêu cầu mượn phòng của giảng viên",
        icon: BookOpen,
        tone: "bg-[#FFF3E1] text-[#ED9B2C]",
      },
      {
        key: "stats",
        title: "Thống kê",
        desc: "Báo cáo, thống kê tình hình sử dụng phòng",
        icon: Grid2x2,
        tone: "bg-[#EDF6FF] text-[#4F8CF7]",
      },
      {
        key: "settings",
        title: "Cài đặt",
        desc: "Cấu hình hệ thống, phân quyền người dùng",
        icon: Settings,
        tone: "bg-[#EEF2F8] text-[#5D6B82]",
      },
    ] as const

    const notifications = borrowRequests
      .filter((request) => request.status === "pending")
      .slice(-4)
      .reverse()
      .map((request) => ({
        text: `${request.requester} (${request.requesterType}) gửi phiếu mượn${request.courseName ? ` môn ${request.courseName}` : " phòng"}`,
        time: request.borrowDate ?? "Đang chờ duyệt",
        type: "dot-orange",
      }))

    const renderHome = () => (
      <div className="rounded-[28px] border border-slate-200 bg-[#f6fafb] p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[2.2rem] font-bold tracking-tight text-slate-800">Xin chào, Admin!</h2>
            <p className="mt-3 max-w-[760px] text-[15px] leading-6 text-slate-500">
              Chào mừng bạn đến với hệ thống phân bổ phòng học học APAG. Cùng quản lý và sắp xếp phòng học hiệu quả.
            </p>
          </div>

          <div className="flex min-w-[320px] items-center justify-between rounded-[22px] border border-sky-100 bg-[#eaf5ff] p-4 shadow-inner shadow-white/20">
            <div>
              <div className="text-[13px] font-medium capitalize text-slate-500">{currentDate}</div>
              <div className="mt-2 text-[2.2rem] font-bold tracking-tight tabular-nums text-slate-800">{currentTime}</div>
            </div>
            <div className="relative h-[92px] w-[190px] overflow-hidden rounded-[18px] bg-gradient-to-br from-[#ebf6ff] via-[#dff2ff] to-[#d9f4ea]">
              <div className="absolute inset-x-0 bottom-0 h-10 bg-[#d9f0db]" />
              <div className="absolute inset-x-6 bottom-5 h-12 rounded-t-[18px] bg-[#d8f0ff] shadow-inner shadow-white/30" />
              <div className="absolute left-8 top-5 h-6 w-10 rounded-[8px] bg-[#cfe7ff]" />
              <div className="absolute right-10 top-5 h-8 w-12 rounded-[8px] bg-[#d3edff]" />
              <div className="absolute inset-x-0 bottom-0 h-8 bg-[#b8e6b8] opacity-80" />
              <div className="absolute right-3 top-3 rounded-full bg-[#dff5ff] px-2 py-1 text-[10px] font-bold tracking-wide text-sky-700">APAG</div>
            </div>
          </div>
        </div>

        <section className="mb-8">
          <h3 className="mb-4 text-[15px] font-bold uppercase tracking-[0.02em] text-slate-700">Chức năng chính</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {functionCards.map(({ key, title, desc, icon: Icon, tone }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivePanel(key)}
                className="group flex items-center justify-between rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-slate-800">{title}</div>
                    <div className="mt-1 max-w-[220px] text-sm leading-5 text-slate-500">{desc}</div>
                  </div>
                </div>
                <span className="text-xl text-slate-400 transition group-hover:translate-x-1">›</span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-slate-800">Tổng quan hệ thống</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {statCards.map(({ label, value, color }) => (
                <div key={label} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                  <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
                    <Grid2x2 className="h-5 w-5" />
                  </div>
                  <div className="text-[2rem] font-bold tracking-tight text-slate-800">{value}</div>
                  <div className="mt-1 text-sm text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-slate-800">Thông báo</h3>
              <button type="button" className="text-sm font-medium text-slate-500 hover:text-slate-700">
                Xem tất cả →
              </button>
            </div>

            <ul className="space-y-3">
              {notifications.length === 0 ? (
                <li className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  Chưa có phiếu mượn phòng mới cần xử lý.
                </li>
              ) : notifications.map(({ text, time, type }, index) => (
                <li key={`${text}-${index}`} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span
                    className={[
                      "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                      type === "dot-blue" && "bg-[#2A6FD8]",
                      type === "dot-green" && "bg-[#21b66f]",
                      type === "dot-orange" && "bg-[#f0a43b]",
                      type === "dot-slate" && "bg-slate-500",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                  <div className="flex-1">
                    <div className="text-[14px] leading-5 text-slate-700">{text}</div>
                    <div className="mt-1 text-xs text-slate-400">{time}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    )

    return (
      <div className="min-h-screen bg-[#edf4f6] text-slate-800">
        <div className="flex min-h-screen">
          <aside className="w-[260px] border-r border-slate-200 bg-white/80 px-5 py-6 shadow-sm backdrop-blur-sm">
            <div className="mb-8 flex items-center gap-3 px-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf6ff] text-[#1a7ad9]">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="text-[2.1rem] font-black tracking-tight text-[#1789d9]">APAG</div>
            </div>

            <nav className="space-y-2">
              {menuItems.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivePanel(key)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium transition-all",
                    activePanel === key
                      ? "bg-[#eaf4ff] text-[#1a7ad9] shadow-sm ring-1 ring-[#d9ebff]"
                      : "text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          <main className="flex-1">
            <header className="flex h-[82px] items-center justify-end border-b border-slate-200 bg-white/80 px-6 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <button type="button" aria-label="Thông báo" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200">
                  <Bell className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf4ff] text-[#1a7ad9]">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <span className="text-base font-semibold text-slate-700">Admin</span>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </div>
              </div>
            </header>

            <div className="p-6">
              {activePanel === "home" ? renderHome() : activePanel === "borrow" ? <BorrowRoomPanel /> : activePanel === "rooms" ? <RoomManagementPanel /> : activePanel === "equipment" ? <EquipmentExplorer /> : activePanel === "scheduler" ? (
                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                  {children}
                </div>
              ) : <div className="min-h-[520px] rounded-[28px] bg-white" />}
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-background to-slate-200">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-col gap-4 rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_8px_30px_rgb(15,23,42,0.06)] backdrop-blur-xl md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Building2 className="size-6" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Học viện Hành chính &amp; Quản trị Công
                </p>
                <h1 className="text-lg font-bold leading-tight text-foreground md:text-xl">
                  Hệ thống quản lý phòng học
                </h1>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                {isAdmin ? "Khu vực quản trị" : isLecturer ? "Cổng giảng viên" : "Khu vực sinh viên"}
              </span>
              <ThemeToggle />
            </div>
          </div>

          <nav className="flex flex-wrap gap-2" aria-label="Khu vực hệ thống">
            {!isAdmin ? (
              <>
                <PortalLink
                  active={activeTab === "register"}
                  onClick={() => setActiveTab("register")}
                  icon={<DoorOpen className="size-4" />}
                >
                  {isLecturer ? "Đăng ký mượn phòng" : "Tra cứu &amp; mượn phòng"}
                </PortalLink>
                <PortalLink
                  active={activeTab === "history"}
                  onClick={() => setActiveTab("history")}
                  icon={<History className="size-4" />}
                >
                  Lịch sử mượn phòng
                </PortalLink>
                {isLecturer && (
                  <PortalLink
                    active={activeTab === "incidents"}
                    onClick={() => setActiveTab("incidents")}
                    icon={<FileWarning className="size-4" />}
                  >
                    Báo cáo sự cố
                    {openIncidentCount > 0 && (
                      <span className="ml-1 min-w-5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
                        {openIncidentCount}
                      </span>
                    )}
                  </PortalLink>
                )}
              </>
            ) : (
              <PortalLink href="/admin" active icon={<ShieldCheck className="size-4" />}>
                Phân bổ phòng học
              </PortalLink>
            )}
          </nav>
        </header>

        <main className="mt-6">
          {isAdmin ? (
            children
          ) : activeTab === "history" ? (
            <BorrowHistoryPanel requesterType={isLecturer ? "Giảng viên" : "Sinh viên"} />
          ) : activeTab === "incidents" && isLecturer ? (
            <LecturerIncidentPanel />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}

function PortalLink({
  href,
  active,
  icon,
  children,
  onClick,
}: {
  href?: string
  active: boolean
  icon: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
}) {
  const className = [
    "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
    active
      ? "border-primary bg-primary text-primary-foreground shadow-sm"
      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
  ].join(" ")

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {icon}
        {children}
      </button>
    )
  }

  return (
    <Link href={href ?? "/"} aria-current={active ? "page" : undefined} className={className}>
      {icon}
      {children}
    </Link>
  )
}
