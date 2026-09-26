"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  DoorOpen,
  Layers3,
  Pencil,
  Plus,
  Power,
  Trash2,
  TriangleAlert,
  Unplug,
  Wrench,
  X,
} from "lucide-react"
import { localEquipmentControlService } from "@/lib/equipment-service"
import { INCIDENTS_UPDATED_EVENT, loadIncidents, saveIncidents, type EquipmentIncident, type IncidentStatus } from "@/lib/incident-store"
import {
  EQUIPMENT_UPDATED_EVENT,
  loadEquipment,
  saveEquipment,
  type EquipmentItem,
  type EquipmentStatus,
} from "@/lib/equipment-store"
import { SHEET_ROOMS } from "@/lib/schedule-data"
import type { RoomInfo } from "@/lib/scheduling"

type CampusName = NonNullable<RoomInfo["campus"]>
type EquipmentDraft = Pick<EquipmentItem, "name" | "category" | "roomId" | "status" | "controllable" | "notes"> & { quantity: string }
type HierarchyLevel = "campus" | "building" | "floor" | "room"

const CAMPUS_ORDER: CampusName[] = ["36 Xuân La", "371 Nguyễn Hoàng Tôn", "77 NCT"]
const EMPTY_DRAFT: EquipmentDraft = { name: "", category: "", roomId: "", quantity: "1", status: "active", controllable: false, notes: "" }
const STATUS_LABELS: Record<EquipmentStatus, string> = {
  active: "Đang hoạt động",
  off: "Đang tắt",
  maintenance: "Cần bảo trì",
  broken: "Đang hỏng",
  offline: "Mất kết nối",
}
const STATUS_STYLES: Record<EquipmentStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  off: "bg-slate-100 text-slate-600 ring-slate-200",
  maintenance: "bg-amber-50 text-amber-700 ring-amber-200",
  broken: "bg-red-50 text-red-700 ring-red-200",
  offline: "bg-neutral-100 text-neutral-700 ring-neutral-300",
}
const FIELD_CLASS = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"

function roomFloor(room: RoomInfo): string | null {
  const codedFloor = room.name.match(/^[A-Z]+\s*(\d{3,4})/i)?.[1]
  if (codedFloor) return String(Number(codedFloor[0]))
  return room.name.match(/^(\d+)[A-Z]/i)?.[1] ?? null
}

function floorLabel(floor: string): string {
  return floor === "unassigned" ? "Khu vực không phân tầng" : `Tầng ${floor}`
}

function buildingLabel(building: string): string {
  if (building === "HoiTruong") return "Hội trường"
  if (building.startsWith("36XL-")) return `Tòa ${building.slice("36XL-".length)}`
  if (building === "371NHT") return "Tòa 371NHT"
  if (building === "77NCT") return "Tòa 77NCT"
  return `Tòa ${building}`
}

function summarize(items: EquipmentItem[], roomIds: Set<string>) {
  const inRooms = items.filter((item) => roomIds.has(item.roomId))
  return {
    total: inRooms.reduce((sum, item) => sum + item.quantity, 0),
    active: inRooms.filter((item) => item.status === "active").reduce((sum, item) => sum + item.quantity, 0),
    maintenance: inRooms.filter((item) => item.status === "maintenance").reduce((sum, item) => sum + item.quantity, 0),
    broken: inRooms.filter((item) => item.status === "broken").reduce((sum, item) => sum + item.quantity, 0),
  }
}

function roomsForCampus(campus: CampusName) {
  return SHEET_ROOMS.filter((room) => room.campus === campus)
}

function roomsForBuilding(rooms: RoomInfo[], building: string) {
  return rooms.filter((room) => (room.building ?? "Chưa phân tòa") === building)
}

function orderedCampuses(): CampusName[] {
  const available = new Set(SHEET_ROOMS.map((room) => room.campus).filter((campus): campus is CampusName => Boolean(campus)))
  return CAMPUS_ORDER.filter((campus) => available.has(campus))
}

export function EquipmentExplorer() {
  const [items, setItems] = useState<EquipmentItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [campus, setCampus] = useState<CampusName | null>(null)
  const [building, setBuilding] = useState<string | null>(null)
  const [floor, setFloor] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [draft, setDraft] = useState<EquipmentDraft>(EMPTY_DRAFT)
  const [incidents, setIncidents] = useState<EquipmentIncident[]>([])
  const [showIncidentQueue, setShowIncidentQueue] = useState(false)

  useEffect(() => {
    const refresh = () => {
      setItems(loadEquipment())
      setIncidents(loadIncidents())
      setIsLoaded(true)
    }
    refresh()
    window.addEventListener(EQUIPMENT_UPDATED_EVENT, refresh)
    window.addEventListener(INCIDENTS_UPDATED_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(EQUIPMENT_UPDATED_EVENT, refresh)
      window.removeEventListener(INCIDENTS_UPDATED_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  const campuses = useMemo(() => orderedCampuses(), [])
  const unassignedItems = items.filter((item) => !item.roomId || !SHEET_ROOMS.some((candidate) => candidate.id === item.roomId))
  const campusRooms = campus ? roomsForCampus(campus) : []
  const buildingRooms = campusRooms.filter((candidate) => (candidate.building ?? "Chưa phân tòa") === building)
  const floorRooms = buildingRooms.filter((candidate) => (roomFloor(candidate) ?? "unassigned") === floor)
  const roomItems = room ? items.filter((item) => item.roomId === room.id) : []
  const view = showUnassigned ? "unassigned" : room ? "room" : floor ? "floor" : building ? "building" : campus ? "campus" : "campuses"

  const breadcrumbs: { label: string; level: HierarchyLevel | "root" | "unassigned"; value?: string }[] = [
    { label: "Quản lý thiết bị", level: "root" },
    ...(campus ? [{ label: campus, level: "campus" as const }] : []),
    ...(building ? [{ label: buildingLabel(building), level: "building" as const }] : []),
    ...(floor ? [{ label: floorLabel(floor), level: "floor" as const }] : []),
    ...(room ? [{ label: room.name, level: "room" as const }] : []),
    ...(showUnassigned ? [{ label: "Thiết bị chưa gán phòng", level: "unassigned" as const }] : []),
  ]

  function goTo(level: HierarchyLevel | "root" | "unassigned") {
    if (level === "root") {
      setCampus(null)
      setBuilding(null)
      setFloor(null)
      setRoom(null)
      setShowUnassigned(false)
    } else if (level === "campus") {
      setBuilding(null)
      setFloor(null)
      setRoom(null)
      setShowUnassigned(false)
    } else if (level === "building") {
      setFloor(null)
      setRoom(null)
      setShowUnassigned(false)
    } else if (level === "floor") {
      setRoom(null)
      setShowUnassigned(false)
    } else if (level === "unassigned") {
      setCampus(null)
      setBuilding(null)
      setFloor(null)
      setRoom(null)
      setShowUnassigned(true)
    }
  }

  function openCreateForm(roomId = room?.id ?? "") {
    setEditingItem(null)
    setDraft({ ...EMPTY_DRAFT, roomId })
    setIsFormOpen(true)
  }

  function openEditForm(item: EquipmentItem) {
    setEditingItem(item)
    setDraft({ ...item, quantity: String(item.quantity) })
    setIsFormOpen(true)
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const quantity = Number(draft.quantity)
    if (!draft.name.trim() || !draft.category.trim() || !Number.isInteger(quantity) || quantity < 1) return

    const savedItem: EquipmentItem = {
      ...draft,
      id: editingItem?.id ?? `equipment-${Date.now()}`,
      name: draft.name.trim(),
      category: draft.category.trim(),
      roomId: draft.roomId,
      quantity,
      notes: draft.notes.trim(),
      updatedAt: new Date().toISOString(),
      ...(editingItem?.isDemo ? { isDemo: true } : {}),
    }
    const nextItems = editingItem
      ? items.map((item) => item.id === editingItem.id ? savedItem : item)
      : [savedItem, ...items]
    saveEquipment(nextItems)
    setItems(nextItems)
    setIsFormOpen(false)
  }

  function removeItem(item: EquipmentItem) {
    if (!window.confirm(`Xóa thiết bị “${item.name}” khỏi danh mục?`)) return
    const nextItems = items.filter((candidate) => candidate.id !== item.id)
    saveEquipment(nextItems)
    setItems(nextItems)
  }

  function updateIncidentStatus(id: string, status: IncidentStatus) {
    const nextIncidents = incidents.map((incident) => incident.id === id ? { ...incident, status } : incident)
    saveIncidents(nextIncidents)
    setIncidents(nextIncidents)
  }

  async function togglePower(item: EquipmentItem) {
    if (!item.controllable || (item.status !== "active" && item.status !== "off")) return
    await localEquipmentControlService.setPowerState(item.id, item.status === "active" ? "off" : "active")
    setItems(loadEquipment())
  }

  if (!isLoaded) {
    return <div className="space-y-4" aria-label="Đang tải dữ liệu thiết bị"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="grid gap-4 md:grid-cols-3">{CAMPUS_ORDER.map((entry) => <div key={entry} className="h-56 animate-pulse rounded-xl bg-slate-100" />)}</div></div>
  }

  const content = (() => {
    if (view === "campuses") {
      return (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Chọn cơ sở">
          {campuses.map((entry, index) => {
            const siteRooms = roomsForCampus(entry)
            const siteBuildings = new Set(siteRooms.map((candidate) => candidate.building ?? "Chưa phân tòa"))
            const summary = summarize(items, new Set(siteRooms.map((candidate) => candidate.id)))
            return (
              <button key={entry} type="button" onClick={() => { setCampus(entry); setShowUnassigned(false) }} className="group relative min-h-60 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-sky-300 hover:shadow-md">
                <div className="absolute inset-x-0 top-0 h-1 bg-sky-600" />
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase text-slate-500">Cơ sở {String(index + 1).padStart(2, "0")}</p><h2 className="mt-1 text-xl font-bold text-slate-900">{entry}</h2></div>
                  <CampusIllustration />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 text-sm">
                  <Metric label="Tòa nhà" value={siteBuildings.size} />
                  <Metric label="Phòng học" value={siteRooms.length} />
                  <Metric label="Thiết bị" value={summary.total} />
                  <Metric label="Đang hoạt động" value={summary.active} accent="green" />
                  <Metric label="Cần bảo trì" value={summary.maintenance} accent="amber" />
                </div>
                <div className="mt-4 flex items-center justify-end gap-1 text-sm font-semibold text-sky-700">Xem chi tiết <ChevronRight className="size-4 transition group-hover:translate-x-1" /></div>
              </button>
            )
          })}
        </section>
      )
    }

    if (view === "campus") {
      const buildings = [...new Set(campusRooms.map((candidate) => candidate.building ?? "Chưa phân tòa"))].sort((left, right) => left.localeCompare(right, "vi"))
      return (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={`Tòa nhà thuộc ${campus}`}>
          {buildings.map((entry, index) => {
            const rooms = roomsForBuilding(campusRooms, entry)
            const floors = new Set(rooms.map((candidate) => roomFloor(candidate)).filter((value): value is string => value !== null))
            const summary = summarize(items, new Set(rooms.map((candidate) => candidate.id)))
            return (
              <button key={entry} type="button" onClick={() => setBuilding(entry)} className="group min-h-52 rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
                <div className="flex items-start justify-between"><span className="flex size-11 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><Building2 className="size-5" /></span><span className="text-xs font-medium text-slate-400">TÒA {String(index + 1).padStart(2, "0")}</span></div>
                <h2 className="mt-4 text-lg font-bold text-slate-900">{buildingLabel(entry)}</h2>
                <p className="mt-1 text-xs text-slate-500">Mã dữ liệu: {entry}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                  <Metric label="Số tầng" value={floors.size} /><Metric label="Số phòng" value={rooms.length} /><Metric label="Thiết bị" value={summary.total} /><Metric label="Đang hoạt động" value={summary.active} accent="green" /><Metric label="Cần bảo trì" value={summary.maintenance} accent="amber" />
                </div>
                <div className="mt-4 flex items-center justify-end gap-1 text-sm font-semibold text-sky-700">Xem các tầng <ChevronRight className="size-4 transition group-hover:translate-x-1" /></div>
              </button>
            )
          })}
        </section>
      )
    }

    if (view === "building") {
      const floors = [...new Set(buildingRooms.map((candidate) => roomFloor(candidate) ?? "unassigned"))].sort((left, right) => {
        if (left === "unassigned") return 1
        if (right === "unassigned") return -1
        return Number(left) - Number(right)
      })
      return (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`Các tầng của ${building ? buildingLabel(building) : "tòa nhà"}`}>
          {floors.map((entry, index) => {
            const rooms = buildingRooms.filter((candidate) => (roomFloor(candidate) ?? "unassigned") === entry)
            const summary = summarize(items, new Set(rooms.map((candidate) => candidate.id)))
            return (
              <button key={entry} type="button" onClick={() => setFloor(entry)} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-sky-300 hover:shadow-md">
                <div className="absolute inset-y-0 left-0 w-1 bg-sky-600/70" />
                <div className="flex items-center justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Layers3 className="size-5" /></span><span className="text-xs text-slate-400">{String(index + 1).padStart(2, "0")}</span></div>
                <h2 className="mt-4 text-lg font-bold text-slate-900">{floorLabel(entry)}</h2>
                <p className="mt-1 text-sm text-slate-500">{rooms.length} {rooms.length === 1 ? "phòng" : "phòng"}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500"><span>{summary.total} thiết bị</span><span className="text-emerald-700">{summary.active} hoạt động</span></div>
                <div className="mt-4 flex items-center justify-end gap-1 text-sm font-semibold text-sky-700">Xem phòng <ChevronRight className="size-4 transition group-hover:translate-x-1" /></div>
              </button>
            )
          })}
        </section>
      )
    }

    if (view === "floor") {
      return (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label={`Phòng tại ${floor ? floorLabel(floor) : "tầng"}`}>
          {floorRooms.map((entry) => {
            const summary = summarize(items, new Set([entry.id]))
            return (
              <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">{entry.name}</h2><p className="mt-1 text-sm text-slate-500">{entry.capacity} chỗ</p></div><span className="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><DoorOpen className="size-4" /></span></div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{summary.total} thiết bị</span><span className="text-emerald-700">{summary.active} hoạt động</span></div>
                <button type="button" onClick={() => setRoom(entry)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-900">Xem thiết bị <ChevronRight className="size-4" /></button>
              </article>
            )
          })}
        </section>
      )
    }

    if (view === "unassigned") {
      return (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h2 className="font-bold text-slate-900">Thiết bị chưa gán phòng</h2><p className="mt-1 text-sm text-slate-500">Gán thiết bị vào phòng thuộc dữ liệu cơ sở hiện có.</p></div><button type="button" onClick={() => openCreateForm()} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"><Plus className="size-4" /> Thêm thiết bị</button></div>
          {unassignedItems.length === 0 ? <EmptyState title="Không có thiết bị chưa gán phòng" message="Các thiết bị mới có thể được thêm từ trang chi tiết của từng phòng." /> : <EquipmentRows items={unassignedItems} onEdit={openEditForm} onRemove={removeItem} onToggle={togglePower} />}
        </section>
      )
    }

    return (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><DoorOpen className="size-5" /></span><div><h2 className="font-bold text-slate-900">Phòng {room?.name}</h2><p className="mt-1 text-sm text-slate-500">{room?.capacity} chỗ · {room?.campus} · {room?.building ? buildingLabel(room.building) : "Chưa phân tòa"}</p></div></div>
          <button type="button" onClick={() => openCreateForm(room?.id)} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800"><Plus className="size-4" /> Thêm thiết bị</button>
        </div>
        {roomItems.some((item) => item.controllable) && <p className="border-b border-sky-100 bg-sky-50/70 px-4 py-2.5 text-xs text-sky-900 sm:px-5">Điều khiển hiện mô phỏng và lưu trên trình duyệt này; chưa kết nối API hoặc ESP32.</p>}
        {roomItems.length === 0 ? <EmptyState title="Phòng chưa có thiết bị" message="Thêm thiết bị để ghi nhận tài sản của phòng này." action={<button type="button" onClick={() => openCreateForm(room?.id)} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus className="size-4" /> Thêm thiết bị</button>} /> : <EquipmentRows items={roomItems} onEdit={openEditForm} onRemove={removeItem} onToggle={togglePower} />}
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5">Danh mục thiết bị chỉ gồm dữ liệu đã khai báo; không tự điền thiết bị cho các phòng còn lại.</div>
      </section>
    )
  })()

  const unassignedCount = unassignedItems.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200" role="tablist" aria-label="Quản lý thiết bị và báo cáo sự cố">
        <button type="button" role="tab" aria-selected={!showIncidentQueue} onClick={() => setShowIncidentQueue(false)} className={`border-b-2 px-3 py-2 text-sm font-semibold ${showIncidentQueue ? "border-transparent text-slate-500 hover:text-slate-800" : "border-sky-700 text-sky-800"}`}>Thiết bị</button>
        <button type="button" role="tab" aria-selected={showIncidentQueue} onClick={() => setShowIncidentQueue(true)} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${showIncidentQueue ? "border-sky-700 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>Sự cố{incidents.some((incident) => incident.status !== "resolved") && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-700">{incidents.filter((incident) => incident.status !== "resolved").length}</span>}</button>
      </div>
      {showIncidentQueue ? <IncidentQueue incidents={incidents} onStatusChange={updateIncidentStatus} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Đường dẫn quản lý thiết bị" className="flex min-w-0 flex-wrap items-center gap-y-1 text-sm">
          {breadcrumbs.map((crumb, index) => <span key={`${crumb.level}-${crumb.label}`} className="inline-flex min-w-0 items-center"><button type="button" disabled={index === breadcrumbs.length - 1} onClick={() => goTo(crumb.level)} className={`max-w-52 truncate ${index === breadcrumbs.length - 1 ? "font-semibold text-slate-900" : "text-slate-500 hover:text-sky-700"}`}>{crumb.label}</button>{index < breadcrumbs.length - 1 && <ChevronRight className="mx-1 size-4 shrink-0 text-slate-400" />}</span>)}
        </nav>
        {!campus && !showUnassigned && unassignedCount > 0 && <button type="button" onClick={() => setShowUnassigned(true)} className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-sky-700">{unassignedCount} thiết bị chưa gán phòng</button>}
        {showUnassigned && <button type="button" onClick={() => goTo("root")} className="text-sm font-medium text-slate-600 hover:text-sky-700">Về sơ đồ cơ sở</button>}
      </div>
      <div key={view} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
        {content}
      </div>
      {isFormOpen && <EquipmentForm draft={draft} onChange={setDraft} onSubmit={handleSave} onClose={() => setIsFormOpen(false)} editing={Boolean(editingItem)} />}
      </>}
    </div>
  )
}

function IncidentQueue({ incidents, onStatusChange }: { incidents: EquipmentIncident[]; onStatusChange: (id: string, status: IncidentStatus) => void }) {
  const severityLabels = { critical: "Nghiêm trọng", medium: "Trung bình", low: "Thấp" }
  const statusLabels = { pending: "Chưa xử lý", in_progress: "Đang xử lý", resolved: "Đã xử lý" }
  const statusStyles = { pending: "text-red-700", in_progress: "text-amber-700", resolved: "text-emerald-700" }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4"><h2 className="font-bold text-slate-900">Báo cáo sự cố</h2><p className="mt-1 text-sm text-slate-500">Cập nhật trạng thái xử lý tại Phòng Đào tạo; giảng viên chỉ theo dõi.</p></div>
      {incidents.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Chưa có báo cáo sự cố.</div> : <ul className="divide-y divide-slate-100">{[...incidents].sort((left, right) => right.reportedAt.localeCompare(left.reportedAt)).map((incident) => <li key={incident.id} className="grid gap-3 p-4 md:grid-cols-[1.4fr_1fr_1fr_190px] md:items-center"><div><p className="font-semibold text-slate-800">{incident.equipmentName} · Phòng {incident.roomId}{incident.isDemo && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Demo</span>}</p><p className="mt-1 text-sm text-slate-600">{incident.issueType} · {incident.description}</p><p className="mt-1 text-xs text-slate-400">{incident.reportedBy} · {new Date(incident.reportedAt).toLocaleString("vi-VN")}</p></div><span className="text-sm text-slate-600">{severityLabels[incident.severity]}</span><span className={`text-sm font-semibold ${statusStyles[incident.status]}`}>{statusLabels[incident.status]}</span><select aria-label={`Cập nhật trạng thái sự cố ${incident.id}`} value={incident.status} onChange={(event) => onStatusChange(incident.id, event.target.value as IncidentStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="pending">Chưa xử lý</option><option value="in_progress">Đang xử lý</option><option value="resolved">Đã xử lý</option></select></li>)}</ul>}
    </section>
  )
}

function CampusIllustration() {
  return <div aria-hidden="true" className="flex h-14 items-end gap-1 rounded-lg bg-sky-50 px-2 pb-2 pt-1 text-sky-700"><div className="h-6 w-4 rounded-t-sm bg-sky-300" /><div className="h-10 w-5 rounded-t-sm bg-sky-600"><div className="mt-2 grid grid-cols-2 gap-1 px-1"><i className="h-1.5 rounded-sm bg-white/80" /><i className="h-1.5 rounded-sm bg-white/80" /><i className="h-1.5 rounded-sm bg-white/80" /><i className="h-1.5 rounded-sm bg-white/80" /></div></div><div className="h-8 w-4 rounded-t-sm bg-emerald-500" /></div>
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: "green" | "amber" }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className={`mt-0.5 font-semibold tabular-nums ${accent === "green" ? "text-emerald-700" : accent === "amber" ? "text-amber-700" : "text-slate-800"}`}>{value}</p></div>
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <div className="px-6 py-12 text-center"><div className="mx-auto flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Wrench className="size-5" /></div><h3 className="mt-3 text-sm font-semibold text-slate-800">{title}</h3><p className="mt-1 text-sm text-slate-500">{message}</p>{action}</div>
}

function EquipmentRows({ items, onEdit, onRemove, onToggle }: { items: EquipmentItem[]; onEdit: (item: EquipmentItem) => void; onRemove: (item: EquipmentItem) => void; onToggle: (item: EquipmentItem) => void }) {
  return (
    <div>
      <div className="hidden grid-cols-[minmax(150px,1.3fr)_minmax(120px,1fr)_minmax(150px,1fr)_80px_130px_140px] gap-3 bg-slate-50 px-5 py-3 text-xs font-bold uppercase text-slate-500 md:grid"><span>Thiết bị</span><span>Loại</span><span>Trạng thái</span><span>Số lượng</span><span>Điều khiển</span><span className="sr-only">Thao tác</span></div>
      <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(150px,1.3fr)_minmax(120px,1fr)_minmax(150px,1fr)_80px_130px_140px] md:items-center md:px-5">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{item.name}</p>{item.isDemo && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Demo</span>}</div>{item.notes && <p className="mt-1 truncate text-xs text-slate-500">{item.notes}</p>}</div>
        <p className="text-sm text-slate-600"><span className="mr-2 text-xs text-slate-400 md:hidden">Loại</span>{item.category}</p>
        <StatusBadge status={item.status} />
        <p className="text-sm font-semibold tabular-nums text-slate-700"><span className="mr-2 text-xs font-normal text-slate-400 md:hidden">Số lượng</span>{item.quantity}</p>
        <div>{item.controllable && (item.status === "active" || item.status === "off") ? <button type="button" onClick={() => onToggle(item)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${item.status === "active" ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}><Power className="size-3.5" />{item.status === "active" ? "Tắt" : "Bật"}</button> : <span className="text-xs text-slate-400">Không hỗ trợ</span>}</div>
        <div className="flex items-center gap-1 md:justify-end"><button type="button" title="Sửa thiết bị" aria-label={`Sửa ${item.name}`} onClick={() => onEdit(item)} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-700"><Pencil className="size-4" /></button><button type="button" title="Xóa thiết bị" aria-label={`Xóa ${item.name}`} onClick={() => onRemove(item)} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" /></button></div>
      </li>)}</ul>
    </div>
  )
}

function StatusBadge({ status }: { status: EquipmentStatus }) {
  const Icon = status === "active" ? CheckCircle2 : status === "off" ? Circle : status === "maintenance" ? Wrench : status === "broken" ? TriangleAlert : Unplug
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}><Icon className="size-3.5" />{STATUS_LABELS[status]}</span>
}

function EquipmentForm({ draft, onChange, onSubmit, onClose, editing }: { draft: EquipmentDraft; onChange: (draft: EquipmentDraft) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void; editing: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="equipment-form-title" className="my-auto w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 id="equipment-form-title" className="text-lg font-bold text-slate-900">{editing ? "Cập nhật thiết bị" : "Thêm thiết bị"}</h2><button type="button" aria-label="Đóng biểu mẫu" onClick={onClose} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-4" /></button></div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Tên thiết bị *<input required autoFocus value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} className={FIELD_CLASS} placeholder="Ví dụ: Máy chiếu" /></label>
            <label className="text-sm font-medium text-slate-700">Loại thiết bị *<input required value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value })} className={FIELD_CLASS} placeholder="Ví dụ: Chiếu sáng" /></label>
            <label className="text-sm font-medium text-slate-700">Phòng<select value={draft.roomId} onChange={(event) => onChange({ ...draft, roomId: event.target.value })} className={FIELD_CLASS}><option value="">Chưa gán phòng</option>{SHEET_ROOMS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.campus}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Số lượng<input required type="number" min="1" step="1" value={draft.quantity} onChange={(event) => onChange({ ...draft, quantity: event.target.value })} className={FIELD_CLASS} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Trạng thái<select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as EquipmentStatus })} className={FIELD_CLASS}><option value="active">Đang hoạt động</option><option value="off">Đang tắt</option><option value="maintenance">Cần bảo trì</option><option value="broken">Đang hỏng</option><option value="offline">Mất kết nối</option></select></label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.controllable} onChange={(event) => onChange({ ...draft, controllable: event.target.checked })} className="size-4 accent-sky-700" />Có thể bật/tắt (điều khiển mô phỏng)</label>
          <label className="block text-sm font-medium text-slate-700">Ghi chú<textarea rows={3} value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} className={`${FIELD_CLASS} resize-y`} placeholder="Thông tin tài sản hoặc lưu ý" /></label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Hủy</button><button type="submit" className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">{editing ? "Lưu thay đổi" : "Thêm vào phòng"}</button></div>
        </form>
      </section>
    </div>
  )
}