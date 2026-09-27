"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  Bell,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  DoorOpen,
  MonitorCog,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react"
import {
  ALLOCATION_UPDATED_EVENT,
  loadAllocationSnapshot,
  type AllocationSnapshot,
} from "@/lib/allocation-store"
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  getSchedulingDay,
  isBorrowRequestInWeek,
  loadBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store"
import {
  EQUIPMENT_UPDATED_EVENT,
  loadEquipment,
  type EquipmentItem,
} from "@/lib/equipment-store"
import {
  INCIDENTS_UPDATED_EVENT,
  loadIncidents,
  type EquipmentIncident,
} from "@/lib/incident-store"
import { SHEET_CLASSES, SHEET_ROOMS } from "@/lib/schedule-data"
import {
  SHIFT_PERIODS,
  rangeTime,
} from "@/lib/scheduling"
import {
  getCourseMeetingTimelines,
  isMeetingActiveOnDate,
} from "@/lib/course-timing"

const NUMBER_FORMAT = new Intl.NumberFormat("vi-VN")
const EQUIPMENT_STATUSES = [
  { key: "active", label: "Đang hoạt động", tone: "bg-emerald-500" },
  { key: "off", label: "Đang tắt", tone: "bg-slate-400" },
  { key: "maintenance", label: "Bảo trì", tone: "bg-amber-500" },
  { key: "broken", label: "Hỏng", tone: "bg-red-500" },
  { key: "offline", label: "Mất kết nối", tone: "bg-sky-500" },
] as const

type DashboardData = {
  snapshot: AllocationSnapshot | null
  requests: BorrowRequest[]
  equipment: EquipmentItem[]
  incidents: EquipmentIncident[]
  now: Date | null
}

function getCurrentRoomIds(
  snapshot: AllocationSnapshot | null,
  requests: BorrowRequest[],
  now: Date | null,
): Set<string> {
  const roomIds = new Set<string>()
  if (!now) return roomIds

  const classes = snapshot?.classes ?? SHEET_CLASSES
  const assignments = snapshot?.result.assignments ?? []
  const classById = new Map(classes.map((classInfo) => [classInfo.id, classInfo]))
  const timelines = getCourseMeetingTimelines(classes)
  const day = getSchedulingDay(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  for (const assignment of assignments) {
    const classInfo = classById.get(assignment.classId)
    if (
      !classInfo ||
      assignment.day !== day ||
      !isMeetingActiveOnDate(classInfo, timelines.get(classInfo.id), now)
    )
      continue

    const [start, end] = rangeTime(
      assignment.startPeriod,
      assignment.endPeriod,
    )
      .split(" - ")
      .map((time) => {
        const [hour, minute] = time.split(":").map(Number)
        return hour * 60 + minute
      })
    if (nowMinutes >= start && nowMinutes < end) roomIds.add(assignment.roomId)
  }

  for (const request of requests) {
    if (
      !isBorrowRequestInWeek(request) ||
      request.status !== "approved" ||
      !request.roomId ||
      request.day !== day
    )
      continue

    const [start, end] = rangeTime(request.startPeriod, request.endPeriod)
      .split(" - ")
      .map((time) => {
        const [hour, minute] = time.split(":").map(Number)
        return hour * 60 + minute
      })
    if (nowMinutes >= start && nowMinutes < end) roomIds.add(request.roomId)
  }

  return roomIds
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | string
  detail: string
  icon: typeof Building2
  tone: string
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {typeof value === "number" ? NUMBER_FORMAT.format(value) : value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="size-5" />
        </span>
      </div>
    </article>
  )
}

function BarRows({
  rows,
}: {
  rows: Array<{ label: string; value: number; color: string }>
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">{row.label}</span>
            <span className="font-semibold tabular-nums text-slate-800">
              {NUMBER_FORMAT.format(row.value)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${row.color}`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  )
}

export function AdminStatsPanel() {
  const [data, setData] = useState<DashboardData>({
    snapshot: null,
    requests: [],
    equipment: [],
    incidents: [],
    now: null,
  })

  useEffect(() => {
    const refresh = () =>
      setData({
        snapshot: loadAllocationSnapshot(),
        requests: loadBorrowRequests(),
        equipment: loadEquipment(),
        incidents: loadIncidents(),
        now: new Date(),
      })
    refresh()
    const timer = window.setInterval(() =>
      setData((current) => ({ ...current, now: new Date() })), 30_000)
    window.addEventListener(ALLOCATION_UPDATED_EVENT, refresh)
    window.addEventListener(BORROW_REQUESTS_UPDATED_EVENT, refresh)
    window.addEventListener(EQUIPMENT_UPDATED_EVENT, refresh)
    window.addEventListener(INCIDENTS_UPDATED_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(ALLOCATION_UPDATED_EVENT, refresh)
      window.removeEventListener(BORROW_REQUESTS_UPDATED_EVENT, refresh)
      window.removeEventListener(EQUIPMENT_UPDATED_EVENT, refresh)
      window.removeEventListener(INCIDENTS_UPDATED_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  const currentRoomIds = useMemo(
    () => getCurrentRoomIds(data.snapshot, data.requests, data.now),
    [data.snapshot, data.requests, data.now],
  )
  const classes = data.snapshot?.classes ?? SHEET_CLASSES
  const assignments = data.snapshot?.result.assignments ?? []
  const unassignedCount = data.snapshot
    ? data.snapshot.result.unassigned.length
    : classes.length
  const assignedCount = assignments.length
  const pendingRequests = data.requests.filter(
    (request) => isBorrowRequestInWeek(request) && request.status === "pending",
  ).length
  const approvedRequests = data.requests.filter(
    (request) => isBorrowRequestInWeek(request) && request.status === "approved",
  ).length
  const faultyEquipment = data.equipment
    .filter((item) => item.status === "broken" || item.status === "offline")
    .reduce((total, item) => total + item.quantity, 0)
  const freeRoomCount = Math.max(0, SHEET_ROOMS.length - currentRoomIds.size)
  const equipmentStatusRows = EQUIPMENT_STATUSES.map((status) => ({
    label: status.label,
    color: status.tone,
    value: data.equipment
      .filter((item) => item.status === status.key)
      .reduce((total, item) => total + item.quantity, 0),
  }))
  const openIncidents = data.incidents.filter(
    (incident) => incident.status !== "resolved",
  ).length
  const lastUpdated = data.now
    ? new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(data.now)
    : "Đang cập nhật"

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-700">APAG · QUẢN TRỊ</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Thống kê</h1>
          <p className="mt-1 text-sm text-slate-500">Số liệu cập nhật lúc {lastUpdated}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          <Activity className="size-3.5" /> Dữ liệu trực tiếp
        </span>
      </header>

      <section aria-label="Chỉ số chính" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tổng phòng" value={SHEET_ROOMS.length} detail="Trong danh mục cơ sở" icon={Building2} tone="bg-sky-50 text-sky-700" />
        <MetricCard label="Đang sử dụng" value={currentRoomIds.size} detail="Theo lịch và giờ hiện tại" icon={Users} tone="bg-amber-50 text-amber-700" />
        <MetricCard label="Còn trống" value={freeRoomCount} detail="Tại thời điểm hiện tại" icon={DoorOpen} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="Thiết bị lỗi" value={faultyEquipment} detail="Hỏng hoặc mất kết nối" icon={TriangleAlert} tone="bg-red-50 text-red-700" />
      </section>

      <section aria-label="Biểu đồ thống kê" className="grid gap-4 xl:grid-cols-2">
        <ChartSection title="Sử dụng phòng" description="Phòng đang có lớp hoặc lượt mượn tại thời điểm hiện tại.">
          <BarRows rows={[
            { label: "Đang sử dụng", value: currentRoomIds.size, color: "bg-sky-600" },
            { label: "Còn trống", value: freeRoomCount, color: "bg-emerald-500" },
          ]} />
        </ChartSection>
        <ChartSection title="Tình trạng thiết bị" description={`${NUMBER_FORMAT.format(data.equipment.reduce((total, item) => total + item.quantity, 0))} thiết bị trong danh mục`}>
          {data.equipment.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">Chưa có dữ liệu thiết bị.</p>
          ) : (
            <BarRows rows={equipmentStatusRows} />
          )}
        </ChartSection>
      </section>

      <section aria-label="Số liệu nhanh">
        <div className="mb-3 flex items-center gap-2">
          <CalendarCheck2 className="size-4 text-sky-700" />
          <h2 className="font-bold text-slate-900">Số liệu nhanh</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickStat label="Đã phân phòng" value={assignedCount} icon={CheckCircle2} tone="text-emerald-700" />
          <QuickStat label="Chưa phân phòng" value={unassignedCount} icon={CircleAlert} tone="text-amber-700" />
          <QuickStat label="Yêu cầu mượn chờ duyệt" value={pendingRequests} icon={DoorOpen} tone="text-sky-700" detail={`${approvedRequests} đã duyệt`} />
          <QuickStat label="Sự cố chưa xử lý" value={openIncidents} icon={TriangleAlert} tone="text-red-700" />
        </div>
      </section>
    </div>
  )
}

function QuickStat({
  label,
  value,
  icon: Icon,
  tone,
  detail,
}: {
  label: string
  value: number
  icon: typeof CheckCircle2
  tone: string
  detail?: string
}) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <Icon className={`size-5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-600">{label}</p>
        {detail && <p className="mt-0.5 text-xs text-slate-400">{detail}</p>}
      </div>
      <strong className="text-xl tabular-nums text-slate-900">{NUMBER_FORMAT.format(value)}</strong>
    </article>
  )
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 p-4 sm:p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <Icon className="size-4.5" />
        </span>
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100 px-4 sm:px-5">{children}</div>
    </section>
  )
}

function SettingRow({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-3.5">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
      </div>
      <span className="text-sm font-semibold text-slate-700">{value}</span>
    </div>
  )
}

export function AdminSettingsPanel() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-sky-700">APAG · QUẢN TRỊ</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Cài đặt</h1>
        <p className="mt-1 text-sm text-slate-500">Thông tin hệ thống và các quy tắc đang áp dụng.</p>
      </header>

      <SettingsSection icon={MonitorCog} title="Thông tin hệ thống" description="Thông tin phiên bản và phạm vi lưu trữ hiện tại.">
        <SettingRow label="Tên hệ thống" value="APAG · Quản lý phòng học" />
        <SettingRow label="Vai trò hiện tại" value="Quản trị viên" />
        <SettingRow label="Phạm vi đồng bộ" value="Trình duyệt hiện tại" detail="Dữ liệu lưu trong localStorage, chưa đồng bộ qua nhiều thiết bị." />
      </SettingsSection>

      <SettingsSection icon={Building2} title="Cài đặt phòng" description="Quy tắc thời gian và phân bổ đang được sử dụng.">
        <SettingRow label="Tổng số phòng" value={`${NUMBER_FORMAT.format(SHEET_ROOMS.length)} phòng`} />
        <SettingRow label="Thời lượng một tiết" value="50 phút" />
        <SettingRow label="Ca sáng" value={`Tiết ${SHIFT_PERIODS.morning[0]}–${SHIFT_PERIODS.morning.at(-1)} · 07:00`} />
        <SettingRow label="Ca chiều" value={`Tiết ${SHIFT_PERIODS.afternoon[0]}–${SHIFT_PERIODS.afternoon.at(-1)} · 13:00`} />
        <SettingRow label="Ca tối" value={`Tiết ${SHIFT_PERIODS.evening[0]}–${SHIFT_PERIODS.evening.at(-1)} · 18:00`} />
        <SettingRow label="Đệm giữa lượt mượn" value="15 phút" detail="Khoảng đệm được áp dụng khi đăng ký mượn phòng tạm thời." />
      </SettingsSection>

      <section className="grid gap-4 xl:grid-cols-2">
        <SettingsSection icon={Bell} title="Thông báo" description="Nguồn cập nhật nội bộ trong hệ thống.">
          <SettingRow label="Phiếu mượn phòng" value="Đang theo dõi" detail="Admin nhận cập nhật khi có phiếu mới trên cùng trình duyệt." />
          <SettingRow label="Sự cố thiết bị" value="Đang theo dõi" detail="Sự cố chưa xử lý xuất hiện trong mục Sự cố." />
          <SettingRow label="Thông báo email" value="Chưa cấu hình" detail="Hệ thống hiện chưa kết nối dịch vụ gửi email." />
        </SettingsSection>
        <SettingsSection icon={UserRound} title="Tài khoản admin" description="Tài khoản quản trị đang sử dụng.">
          <SettingRow label="Tên hiển thị" value="Admin" />
          <SettingRow label="Quyền truy cập" value="Quản trị toàn hệ thống" />
          <SettingRow label="Trạng thái" value="Đang hoạt động" />
          <SettingRow label="Bảo mật" value="Phiên trình duyệt hiện tại" detail="Đăng nhập và phân quyền máy chủ chưa được cấu hình." />
        </SettingsSection>
      </section>

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-700" />
        Cài đặt đang hiển thị cấu hình hiện hữu; chỉnh sửa cấu hình tập trung cần backend và tài khoản xác thực.
      </p>
    </div>
  )
}
