"use client"

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react"
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, Clock3, FileWarning, ImagePlus, MapPin, Plus, X } from "lucide-react"
import { ALLOCATION_UPDATED_EVENT, loadAllocationSnapshot, type AllocationSnapshot } from "@/lib/allocation-store"
import { EQUIPMENT_UPDATED_EVENT, loadEquipment, type EquipmentItem, type EquipmentStatus } from "@/lib/equipment-store"
import { INCIDENTS_UPDATED_EVENT, loadIncidents, saveIncidents, type EquipmentIncident, type IncidentSeverity, type IncidentStatus } from "@/lib/incident-store"
import { SHEET_ROOMS, SHEET_CLASSES } from "@/lib/schedule-data"
import { autoSchedule, DAY_LABELS, rangeTime, type ScheduleResult } from "@/lib/scheduling"

type IncidentDraft = {
  roomId: string
  equipmentId: string
  equipmentName: string
  issueType: string
  severity: IncidentSeverity
  description: string
  reportedBy: string
  photoDataUrl: string
}

const ISSUE_TYPES = ["Không hoạt động", "Bị hỏng", "Hoạt động không ổn định", "Thiếu thiết bị", "Mất kết nối", "Khác"]
const SEVERITY_LABELS: Record<IncidentSeverity, string> = { critical: "Nghiêm trọng", medium: "Trung bình", low: "Thấp" }
const STATUS_LABELS: Record<IncidentStatus, string> = { pending: "Chưa xử lý", in_progress: "Đang xử lý", resolved: "Đã xử lý" }
const STATUS_STYLES: Record<IncidentStatus, string> = {
  pending: "bg-red-50 text-red-700 ring-red-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
}
const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  active: "Đang hoạt động",
  off: "Đang tắt",
  maintenance: "Cần bảo trì",
  broken: "Đang hỏng",
  offline: "Mất kết nối",
}
const EMPTY_DRAFT: IncidentDraft = { roomId: "", equipmentId: "", equipmentName: "", issueType: ISSUE_TYPES[0], severity: "medium", description: "", reportedBy: "", photoDataUrl: "" }
const fieldClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"

function currentScheduleDay(): number {
  const weekday = new Date().getDay()
  return weekday === 0 ? 7 : weekday + 1
}

function daysUntil(day: number, today: number): number {
  return (day - today + 7) % 7
}

function statusIsFault(status: EquipmentStatus): boolean {
  return status === "maintenance" || status === "broken" || status === "offline"
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Không rõ thời gian" : date.toLocaleString("vi-VN")
}

export function LecturerIncidentPanel() {
  const [snapshot, setSnapshot] = useState<AllocationSnapshot | null>(null)
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [incidents, setIncidents] = useState<EquipmentIncident[]>([])
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [draft, setDraft] = useState<IncidentDraft>(EMPTY_DRAFT)
  const [imageError, setImageError] = useState("")
  const [submitMessage, setSubmitMessage] = useState("")
  const [selectedIncident, setSelectedIncident] = useState<EquipmentIncident | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const refresh = () => {
      setSnapshot(loadAllocationSnapshot())
      setEquipment(loadEquipment())
      setIncidents(loadIncidents())
    }
    refresh()
    window.addEventListener(ALLOCATION_UPDATED_EVENT, refresh)
    window.addEventListener(EQUIPMENT_UPDATED_EVENT, refresh)
    window.addEventListener(INCIDENTS_UPDATED_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(ALLOCATION_UPDATED_EVENT, refresh)
      window.removeEventListener(EQUIPMENT_UPDATED_EVENT, refresh)
      window.removeEventListener(INCIDENTS_UPDATED_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    setNow(Date.now())
    return () => window.clearInterval(timer)
  }, [])

  const fallbackSchedule = useMemo(() => autoSchedule(SHEET_CLASSES, SHEET_ROOMS), [])
  const schedule: ScheduleResult = snapshot?.result ?? fallbackSchedule
  const classes = snapshot?.classes ?? SHEET_CLASSES
  const upcomingAssignments = useMemo(() => {
    const today = currentScheduleDay()
    return schedule.assignments
      .filter((assignment) => SHEET_ROOMS.some((room) => room.id === assignment.roomId))
      .sort((left, right) => daysUntil(left.day, today) - daysUntil(right.day, today) || left.startPeriod - right.startPeriod)
  }, [schedule, now])
  const scheduledRoomIds = useMemo(() => new Set(schedule.assignments.map((assignment) => assignment.roomId)), [schedule])
  const selectableRooms = SHEET_ROOMS.filter((room) => scheduledRoomIds.size === 0 || scheduledRoomIds.has(room.id))
  const visibleIncidents = [...incidents].sort((left, right) => right.reportedAt.localeCompare(left.reportedAt))
  const pendingCount = incidents.filter((incident) => incident.status !== "resolved").length
  const resolvedCount = incidents.filter((incident) => incident.status === "resolved").length
  const upcomingRoomIds = new Set(upcomingAssignments.map((assignment) => assignment.roomId))
  const warningRoomIds = new Set([
    ...upcomingRoomIds,
    ...equipment.filter((item) => statusIsFault(item.status)).map((item) => item.roomId),
    ...incidents.filter((incident) => incident.status !== "resolved").map((incident) => incident.roomId),
  ])
  const roomGroups = [...warningRoomIds].map((roomId) => ({
    room: SHEET_ROOMS.find((entry) => entry.id === roomId)!,
    assignments: upcomingAssignments.filter((entry) => entry.roomId === roomId),
  })).sort((left, right) => {
    const leftHasIssue = equipment.some((item) => item.roomId === left.room.id && statusIsFault(item.status)) || incidents.some((incident) => incident.roomId === left.room.id && incident.status !== "resolved")
    const rightHasIssue = equipment.some((item) => item.roomId === right.room.id && statusIsFault(item.status)) || incidents.some((incident) => incident.roomId === right.room.id && incident.status !== "resolved")
    if (leftHasIssue !== rightHasIssue) return leftHasIssue ? -1 : 1
    const leftDay = left.assignments[0] ? daysUntil(left.assignments[0].day, currentScheduleDay()) : Number.MAX_SAFE_INTEGER
    const rightDay = right.assignments[0] ? daysUntil(right.assignments[0].day, currentScheduleDay()) : Number.MAX_SAFE_INTEGER
    return leftDay - rightDay || left.room.name.localeCompare(right.room.name, "vi")
  })
  const selectedRoom = selectedRoomId ? SHEET_ROOMS.find((room) => room.id === selectedRoomId) : null
  const selectedRoomEquipment = selectedRoom ? equipment.filter((item) => item.roomId === selectedRoom.id) : []
  const selectedRoomIncidents = selectedRoom ? incidents.filter((incident) => incident.roomId === selectedRoom.id) : []
  const currentSelectedIncident = selectedIncident
    ? incidents.find((incident) => incident.id === selectedIncident.id) ?? selectedIncident
    : null

  function openReport(roomId = selectableRooms[0]?.id ?? "") {
    setDraft({ ...EMPTY_DRAFT, roomId, reportedBy: "" })
    setImageError("")
    setSubmitMessage("")
    setIsReportOpen(true)
  }

  function updateRoom(roomId: string) {
    const roomEquipment = equipment.filter((item) => item.roomId === roomId)
    setDraft((current) => ({ ...current, roomId, equipmentId: roomEquipment[0]?.id ?? "", equipmentName: roomEquipment[0]?.name ?? "" }))
  }

  function updateEquipment(equipmentId: string) {
    const selected = equipment.find((item) => item.id === equipmentId)
    setDraft((current) => ({ ...current, equipmentId, equipmentName: selected?.name ?? "" }))
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setImageError("Vui lòng chọn tệp hình ảnh.")
      return
    }
    if (file.size > 900_000) {
      setImageError("Ảnh cần nhỏ hơn 900 KB để lưu trong bản demo.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setDraft((current) => ({ ...current, photoDataUrl: typeof reader.result === "string" ? reader.result : "" }))
      setImageError("")
    }
    reader.readAsDataURL(file)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.roomId || !draft.reportedBy.trim() || !draft.description.trim()) return
    const nextIncident: EquipmentIncident = {
      id: `incident-${Date.now()}`,
      roomId: draft.roomId,
      equipmentId: draft.equipmentId,
      equipmentName: draft.equipmentName.trim() || "Thiết bị chưa được chọn",
      issueType: draft.issueType,
      severity: draft.severity,
      description: draft.description.trim(),
      reportedAt: new Date().toISOString(),
      reportedBy: draft.reportedBy.trim(),
      status: "pending",
      ...(draft.photoDataUrl ? { photoDataUrl: draft.photoDataUrl } : {}),
    }
    const nextIncidents = [nextIncident, ...incidents]
    saveIncidents(nextIncidents)
    setIncidents(nextIncidents)
    setIsReportOpen(false)
    setSubmitMessage(`Báo cáo sự cố phòng ${nextIncident.roomId} đã được gửi.`)
  }

  const onScheduledRoom = (roomId: string) => incidents.filter((incident) => incident.roomId === roomId && incident.status !== "resolved")

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><FileWarning className="size-5" /></span><div><p className="text-xs font-semibold uppercase text-slate-500">Giảng viên</p><h2 className="mt-1 text-xl font-bold text-slate-900">Báo cáo sự cố</h2><p className="mt-1 text-sm text-slate-600">Theo dõi tình trạng thiết bị tại các phòng học có lịch phân bổ.</p></div></div>
        <button type="button" onClick={() => openReport()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800"><Plus className="size-4" /> Báo cáo sự cố</button>
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-sky-900"><Bell className="mt-0.5 size-4 shrink-0" /><p>Lịch hiện chưa lưu thông tin giảng viên phụ trách; danh sách dưới đây lấy từ lịch phân bổ chung, chưa thể lọc chính xác theo tài khoản cá nhân. Dữ liệu sự cố và thiết bị được chia sẻ giữa các trang trên cùng trình duyệt.</p></div>

      {submitMessage && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 className="size-4" />{submitMessage} Phòng Đào tạo sẽ tiếp nhận và xử lý.</div>}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Tổng quan sự cố"><Summary label="Phòng trong lịch phân bổ" value={upcomingRoomIds.size} /><Summary label="Sự cố chưa xử lý" value={pendingCount} tone="red" /><Summary label="Đã xử lý" value={resolvedCount} tone="green" /></section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Cảnh báo phòng học</h3><p className="mt-1 text-sm text-slate-500">Các lượt phân phòng gần nhất và trạng thái thiết bị liên quan.</p></div><span className="text-xs text-slate-500">{roomGroups.length} phòng</span></div>
        {roomGroups.length === 0 ? <EmptyState title="Chưa có lịch phân bổ phòng" message="Khi phòng Đào tạo lưu lịch phân bổ, các phòng sắp sử dụng sẽ xuất hiện tại đây." /> : <div className="grid gap-3 lg:grid-cols-2">{roomGroups.slice(0, 4).map(({ room, assignments }) => {
          const faults = equipment.filter((item) => item.roomId === room.id && statusIsFault(item.status))
          const activeIncidents = onScheduledRoom(room.id)
          const isClear = faults.length === 0 && activeIncidents.length === 0
          return <article key={room.id} className={`rounded-xl border bg-white p-4 ${isClear ? "border-slate-200" : "border-amber-200"}`}>
            <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2"><MapPin className={`mt-0.5 size-4 ${isClear ? "text-emerald-600" : "text-amber-700"}`} /><div><h4 className="font-bold text-slate-900">Phòng {room.name}</h4><p className="mt-1 text-xs text-slate-500">{room.campus} · {room.building}</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isClear ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{isClear ? "Ổn định" : `${faults.length + activeIncidents.length} cảnh báo`}</span></div>
            <div className="mt-3 space-y-1.5">{assignments.slice(0, 2).map((assignment, index) => {
              const classInfo = classes.find((item) => item.id === assignment.classId)
              return <p key={`${assignment.classId}-${index}`} className="text-sm text-slate-600">{classInfo?.name ?? "Lịch phân phòng"} · {DAY_LABELS[assignment.day] ?? "Trong tuần"} · Tiết {assignment.startPeriod}–{assignment.endPeriod} ({rangeTime(assignment.startPeriod, assignment.endPeriod)})</p>
            })}{assignments.length === 0 && <p className="text-sm text-slate-500">Chưa có tiết sắp tới trong lịch hiện tại.</p>}</div>
            <div className="mt-3 space-y-1.5">{faults.slice(0, 2).map((item) => <p key={item.id} className="flex items-center gap-2 text-sm"><span className={`size-2 shrink-0 rounded-full ${item.status === "broken" ? "bg-red-500" : item.status === "maintenance" ? "bg-amber-500" : "bg-neutral-500"}`} /><span className="font-medium text-slate-800">{item.name}</span><span className="text-slate-600">{EQUIPMENT_STATUS_LABELS[item.status]}</span></p>)}{activeIncidents.slice(0, 2).map((incident) => <button key={incident.id} type="button" onClick={() => setSelectedIncident(incident)} className="flex items-center gap-2 text-left text-sm text-red-700 hover:underline"><AlertTriangle className="size-3.5 shrink-0" />{incident.equipmentName}: {incident.issueType}</button>)}{isClear && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" />Tất cả thiết bị đang hoạt động bình thường.</p>}</div>
            <button type="button" onClick={() => setSelectedRoomId(room.id)} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-900">Xem chi tiết phòng <ChevronRight className="size-4" /></button>
          </article>
        })}</div>}
        {!snapshot && roomGroups.length > 0 && <p className="text-xs text-slate-400">Đang hiển thị lịch gợi ý từ dữ liệu hiện có; admin chưa lưu lịch phân bổ.</p>}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5"><h3 className="font-bold text-slate-900">Danh sách sự cố</h3><p className="mt-1 text-sm text-slate-500">Theo dõi trạng thái xử lý; giảng viên không thể tự thay đổi trạng thái.</p></div>
        {visibleIncidents.length === 0 ? <EmptyState title="Không có sự cố được ghi nhận" message="Các thiết bị tại phòng học hiện chưa có báo cáo sự cố." /> : <ul className="divide-y divide-slate-100">{visibleIncidents.map((incident) => <li key={incident.id}><button type="button" onClick={() => setSelectedIncident(incident)} className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[1.2fr_1fr_1fr_1fr] md:items-center sm:px-5"><div><p className="font-semibold text-slate-900">{incident.equipmentName} · {incident.roomId}</p><p className="mt-1 text-sm text-slate-500">{incident.issueType}</p></div><SeverityBadge severity={incident.severity} /><span className="text-sm text-slate-500">{formatDate(incident.reportedAt)}</span><IncidentStatusBadge status={incident.status} /></button></li>)}</ul>}
      </section>

      {isReportOpen && <ReportDialog draft={draft} equipment={equipment} imageError={imageError} onDraftChange={setDraft} onRoomChange={updateRoom} onEquipmentChange={updateEquipment} onImageChange={handleImageChange} onImageClear={() => setDraft((current) => ({ ...current, photoDataUrl: "" }))} onSubmit={handleSubmit} onClose={() => setIsReportOpen(false)} />}
      {currentSelectedIncident && <IncidentDialog incident={currentSelectedIncident} onClose={() => setSelectedIncident(null)} />}
      {selectedRoom && <RoomDialog room={selectedRoom} equipment={selectedRoomEquipment} incidents={selectedRoomIncidents} onIncidentClick={setSelectedIncident} onClose={() => setSelectedRoomId(null)} />}
    </div>
  )
}

function Summary({ label, value, tone = "sky" }: { label: string; value: number; tone?: "sky" | "red" | "green" }) {
  const styles = { sky: "border-sky-200 bg-sky-50 text-sky-900", red: "border-red-200 bg-red-50 text-red-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900" }
  return <div className={`rounded-xl border px-4 py-3 ${styles[tone]}`}><p className="text-xs font-semibold uppercase opacity-70">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center"><CheckCircle2 className="mx-auto size-6 text-emerald-600" /><p className="mt-3 text-sm font-semibold text-slate-800">{title}</p><p className="mt-1 text-sm text-slate-500">{message}</p></div>
}

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const style = severity === "critical" ? "bg-red-50 text-red-700 ring-red-200" : severity === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-yellow-50 text-yellow-800 ring-yellow-200"
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}><span className="size-2 rounded-full bg-current" />{SEVERITY_LABELS[severity]}</span>
}

function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
}

function DialogFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-label={title} className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4"><h2 className="font-bold text-slate-900">{title}</h2><button type="button" onClick={onClose} aria-label="Đóng" className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-4" /></button></div>{children}</section></div>
}

function IncidentDialog({ incident, onClose }: { incident: EquipmentIncident; onClose: () => void }) {
  return <DialogFrame title="Chi tiết sự cố" onClose={onClose}><div className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><Detail label="Phòng" value={incident.roomId} /><Detail label="Thiết bị" value={incident.equipmentName} /><Detail label="Mã thiết bị" value={incident.equipmentId || "Chưa có mã thiết bị"} /><Detail label="Loại sự cố" value={incident.issueType} /><Detail label="Mức độ" value={SEVERITY_LABELS[incident.severity]} /><Detail label="Thời gian phát hiện" value={formatDate(incident.reportedAt)} /><div><p className="text-xs text-slate-500">Trạng thái xử lý</p><div className="mt-1"><IncidentStatusBadge status={incident.status} /></div></div><Detail label="Người báo cáo" value={incident.reportedBy} /></div><div><p className="text-xs text-slate-500">Mô tả</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{incident.description}</p></div>{incident.photoDataUrl && <img src={incident.photoDataUrl} alt={`Ảnh sự cố ${incident.equipmentName} tại ${incident.roomId}`} className="max-h-72 w-full rounded-lg border border-slate-200 object-contain" />}<div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><Clock3 className="mr-1 inline size-3.5" />Trạng thái do Phòng Đào tạo cập nhật; giảng viên chỉ theo dõi tiến độ.</div></div></DialogFrame>
}

function RoomDialog({ room, equipment, incidents, onIncidentClick, onClose }: { room: (typeof SHEET_ROOMS)[number]; equipment: EquipmentItem[]; incidents: EquipmentIncident[]; onIncidentClick: (incident: EquipmentIncident) => void; onClose: () => void }) {
  return <DialogFrame title={`Chi tiết phòng ${room.name}`} onClose={onClose}><div className="space-y-4 p-5"><p className="text-sm text-slate-500">{room.campus} · {room.building} · Sức chứa {room.capacity}</p><h3 className="font-semibold text-slate-800">Tình trạng thiết bị</h3>{equipment.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Phòng chưa có danh mục thiết bị được ghi nhận.</p> : <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{equipment.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.category}</p></div><span className={`text-xs font-semibold ${statusIsFault(item.status) ? "text-amber-700" : "text-emerald-700"}`}>{EQUIPMENT_STATUS_LABELS[item.status]}</span></li>)}</ul>}<h3 className="font-semibold text-slate-800">Sự cố tại phòng</h3>{incidents.length === 0 ? <p className="text-sm text-slate-500">Chưa có báo cáo sự cố.</p> : <ul className="space-y-2">{incidents.map((incident) => <li key={incident.id}><button type="button" onClick={() => { onClose(); onIncidentClick(incident) }} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"><span className="text-sm font-medium text-slate-800">{incident.equipmentName} · {incident.issueType}</span><IncidentStatusBadge status={incident.status} /></button></li>)}</ul>}</div></DialogFrame>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value}</p></div>
}

function ReportDialog({ draft, equipment, imageError, onDraftChange, onRoomChange, onEquipmentChange, onImageChange, onImageClear, onSubmit, onClose }: { draft: IncidentDraft; equipment: EquipmentItem[]; imageError: string; onDraftChange: (draft: IncidentDraft) => void; onRoomChange: (roomId: string) => void; onEquipmentChange: (equipmentId: string) => void; onImageChange: (event: ChangeEvent<HTMLInputElement>) => void; onImageClear: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const roomEquipment = equipment.filter((item) => item.roomId === draft.roomId)
  return <DialogFrame title="Báo cáo sự cố" onClose={onClose}><form onSubmit={onSubmit} className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Phòng học *<select required value={draft.roomId} onChange={(event) => onRoomChange(event.target.value)} className={fieldClass}>{SHEET_ROOMS.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.campus}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Thiết bị<select value={draft.equipmentId} onChange={(event) => onEquipmentChange(event.target.value)} className={fieldClass}><option value="">Thiết bị khác / chưa có trong danh sách</option>{roomEquipment.map((item) => <option key={item.id} value={item.id}>{item.name} · {EQUIPMENT_STATUS_LABELS[item.status]}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Loại sự cố<select value={draft.issueType} onChange={(event) => onDraftChange({ ...draft, issueType: event.target.value })} className={fieldClass}>{ISSUE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Mức độ<select value={draft.severity} onChange={(event) => onDraftChange({ ...draft, severity: event.target.value as IncidentSeverity })} className={fieldClass}><option value="critical">Nghiêm trọng</option><option value="medium">Trung bình</option><option value="low">Thấp</option></select></label><label className="text-sm font-medium text-slate-700 sm:col-span-2">Người báo cáo *<input required value={draft.reportedBy} onChange={(event) => onDraftChange({ ...draft, reportedBy: event.target.value })} className={fieldClass} placeholder="Họ tên giảng viên" /></label></div><label className="block text-sm font-medium text-slate-700">Mô tả sự cố *<textarea required rows={4} value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} className={`${fieldClass} resize-y`} placeholder="Mô tả biểu hiện và ảnh hưởng đến buổi học" /></label><div><label className="block text-sm font-medium text-slate-700">Ảnh minh họa (không bắt buộc)<span className="mt-1 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><ImagePlus className="size-4" />Chọn ảnh<input type="file" accept="image/*" onChange={onImageChange} className="sr-only" /></span></label>{imageError && <p role="alert" className="mt-1 text-xs text-red-700">{imageError}</p>}{draft.photoDataUrl && <div className="mt-2 flex items-start gap-3"><img src={draft.photoDataUrl} alt="Ảnh đính kèm báo cáo" className="h-20 w-28 rounded-lg border border-slate-200 object-cover" /><button type="button" onClick={onImageClear} className="text-xs font-medium text-red-700 hover:underline">Gỡ ảnh</button></div>}</div><p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Báo cáo được gửi đến hàng đợi sự cố của Phòng Đào tạo. Giảng viên không thể tự đổi trạng thái xử lý.</p><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Hủy</button><button type="submit" className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">Gửi báo cáo</button></div></form></DialogFrame>
}