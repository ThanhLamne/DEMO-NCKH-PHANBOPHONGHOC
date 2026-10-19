"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  DoorOpen,
  Download,
  FileText,
  Layers3,
  Pencil,
  Plus,
  Power,
  Printer,
  Trash2,
  TriangleAlert,
  Unplug,
  Wrench,
  X,
} from "lucide-react"
import { localEquipmentControlService } from "@/lib/equipment-service"
import { INCIDENTS_UPDATED_EVENT, loadIncidents, saveIncidents, type EquipmentIncident, type IncidentStatus, type MaintenanceInvoice } from "@/lib/incident-store"
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
type MaintenanceDraft = {
  invoiceNumber: string
  vendor: string
  maintenanceDate: string
  description: string
  quantity: string
  unitPrice: string
  laborCost: string
  notes: string
}
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
const EMPTY_MAINTENANCE_DRAFT: MaintenanceDraft = {
  invoiceNumber: "",
  vendor: "",
  maintenanceDate: new Date().toISOString().slice(0, 10),
  description: "",
  quantity: "1",
  unitPrice: "0",
  laborCost: "0",
  notes: "",
}

function toMaintenanceDraft(invoice?: MaintenanceInvoice): MaintenanceDraft {
  if (!invoice) return { ...EMPTY_MAINTENANCE_DRAFT }
  return {
    ...invoice,
    quantity: String(invoice.quantity),
    unitPrice: String(invoice.unitPrice),
    laborCost: String(invoice.laborCost),
  }
}

function invoiceFromDraft(draft: MaintenanceDraft): MaintenanceInvoice {
  return {
    invoiceNumber: draft.invoiceNumber.trim(),
    vendor: draft.vendor.trim(),
    maintenanceDate: draft.maintenanceDate,
    description: draft.description.trim(),
    quantity: Number(draft.quantity),
    unitPrice: Number(draft.unitPrice),
    laborCost: Number(draft.laborCost),
    notes: draft.notes.trim(),
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }
    return entities[character]
  })
}

function invoiceHtml(incident: EquipmentIncident, invoice: MaintenanceInvoice): string {
  const room = SHEET_ROOMS.find((entry) => entry.id === incident.roomId)
  const total = invoice.quantity * invoice.unitPrice + invoice.laborCost
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Hóa đơn ${escapeHtml(invoice.invoiceNumber)}</title><style>
    body{font:15px Arial,sans-serif;color:#172033;margin:40px auto;max-width:800px;padding:0 24px}
    h1{text-align:center;font-size:24px;margin:0 0 8px} .muted{color:#64748b}
    .top{text-align:center;margin-bottom:32px} .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin:24px 0}
    table{border-collapse:collapse;width:100%;margin:24px 0} th,td{padding:12px;border:1px solid #cbd5e1;text-align:left}
    th{background:#f1f5f9}.right{text-align:right}.total{font-size:18px;font-weight:bold;text-align:right;margin-top:18px}
    .signatures{display:flex;justify-content:space-between;margin-top:72px;text-align:center}.signatures div{width:40%}
    @media print{body{margin:12mm auto;padding:0}}
  </style></head><body>
    <header class="top"><h1>HÓA ĐƠN / PHIẾU BẢO TRÌ THIẾT BỊ</h1><p class="muted">Mã hóa đơn: ${escapeHtml(invoice.invoiceNumber)}</p></header>
    <section class="grid">
      <div><strong>Phòng:</strong> ${escapeHtml(incident.roomId)}${room ? ` · ${escapeHtml(room.campus ?? "")}` : ""}</div>
      <div><strong>Ngày bảo trì:</strong> ${escapeHtml(invoice.maintenanceDate)}</div>
      <div><strong>Thiết bị:</strong> ${escapeHtml(incident.equipmentName)}</div>
      <div><strong>Đơn vị thực hiện:</strong> ${escapeHtml(invoice.vendor)}</div>
      <div><strong>Mã báo cáo:</strong> ${escapeHtml(incident.id)}</div>
      <div><strong>Người báo cáo:</strong> ${escapeHtml(incident.reportedBy)}</div>
    </section>
    <p><strong>Nội dung báo cáo:</strong> ${escapeHtml(incident.issueType)} — ${escapeHtml(incident.description)}</p>
    <table><thead><tr><th>Nội dung bảo trì</th><th class="right">Số lượng</th><th class="right">Đơn giá</th><th class="right">Thành tiền</th></tr></thead>
      <tbody><tr><td>${escapeHtml(invoice.description)}</td><td class="right">${invoice.quantity}</td><td class="right">${formatCurrency(invoice.unitPrice)}</td><td class="right">${formatCurrency(invoice.quantity * invoice.unitPrice)}</td></tr>
      <tr><td colspan="3">Công bảo trì</td><td class="right">${formatCurrency(invoice.laborCost)}</td></tr></tbody></table>
    ${invoice.notes ? `<p><strong>Ghi chú:</strong> ${escapeHtml(invoice.notes)}</p>` : ""}
    <p class="total">TỔNG CỘNG: ${formatCurrency(total)}</p>
    <div class="signatures"><div>Đơn vị thực hiện<br><br><br>(Ký, ghi rõ họ tên)</div><div>Đại diện quản lý<br><br><br>(Ký, ghi rõ họ tên)</div></div>
  </body></html>`
}

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
  const [maintenanceIncident, setMaintenanceIncident] = useState<EquipmentIncident | null>(null)
  const [maintenanceDraft, setMaintenanceDraft] = useState<MaintenanceDraft>(EMPTY_MAINTENANCE_DRAFT)
  const [showInvoicePreview, setShowInvoicePreview] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState("")

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
    const incident = incidents.find((entry) => entry.id === id)
    if (status === "resolved" && incident?.equipmentId) {
      const nextItems = items.map((item) =>
        item.id === incident.equipmentId && item.status === "maintenance"
          ? { ...item, status: "active" as const, updatedAt: new Date().toISOString() }
          : item,
      )
      if (nextItems.some((item, index) => item !== items[index])) {
        saveEquipment(nextItems)
        setItems(nextItems)
      }
    }
  }

  function openMaintenanceForm(incident: EquipmentIncident) {
    const date = new Date().toISOString().slice(0, 10)
    setMaintenanceIncident(incident)
    setMaintenanceDraft({
      ...toMaintenanceDraft(incident.maintenanceInvoice),
      maintenanceDate: incident.maintenanceInvoice?.maintenanceDate || date,
      invoiceNumber:
        incident.maintenanceInvoice?.invoiceNumber ||
        `BT-${date.replace(/-/g, "")}-${incident.id.slice(-6).toUpperCase()}`,
      description:
        incident.maintenanceInvoice?.description ||
        `${incident.issueType}: ${incident.equipmentName}`,
    })
    setShowInvoicePreview(false)
    setMaintenanceMessage("")
  }

  function saveMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!maintenanceIncident) return
    const invoice = invoiceFromDraft(maintenanceDraft)
    if (
      !invoice.invoiceNumber ||
      !invoice.vendor ||
      !invoice.description ||
      !Number.isInteger(invoice.quantity) ||
      invoice.quantity < 1 ||
      !Number.isFinite(invoice.unitPrice) ||
      invoice.unitPrice < 0 ||
      !Number.isFinite(invoice.laborCost) ||
      invoice.laborCost < 0
    ) {
      setMaintenanceMessage("Vui lòng kiểm tra đơn vị bảo trì, nội dung, số lượng và chi phí.")
      return
    }

    const updatedIncident: EquipmentIncident = {
      ...maintenanceIncident,
      status: "in_progress",
      maintenanceInvoice: invoice,
    }
    const nextIncidents = incidents.map((incident) =>
      incident.id === updatedIncident.id ? updatedIncident : incident,
    )
    saveIncidents(nextIncidents)
    setIncidents(nextIncidents)
    setMaintenanceIncident(updatedIncident)

    if (updatedIncident.equipmentId) {
      const nextItems = items.map((item) =>
        item.id === updatedIncident.equipmentId
          ? { ...item, status: "maintenance" as const, updatedAt: new Date().toISOString() }
          : item,
      )
      if (nextItems.some((item, index) => item !== items[index])) {
        saveEquipment(nextItems)
        setItems(nextItems)
      }
    }
    setMaintenanceMessage("Đã lưu phiếu bảo trì; trạng thái sự cố được chuyển sang đang xử lý.")
    setShowInvoicePreview(true)
  }

  function downloadInvoice(incident: EquipmentIncident, invoice: MaintenanceInvoice) {
    const blob = new Blob([invoiceHtml(incident, invoice)], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, "_")}.html`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function printInvoice(incident: EquipmentIncident, invoice: MaintenanceInvoice) {
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      setMaintenanceMessage("Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.")
      return
    }
    printWindow.document.open()
    printWindow.document.write(invoiceHtml(incident, invoice))
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
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
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5">Mỗi phòng được khởi tạo định mức 2 điều hòa, 1 máy chiếu và 4 quạt trần. Có thể cập nhật theo tình trạng thực tế.</div>
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
      {showIncidentQueue ? <IncidentQueue incidents={incidents} onStatusChange={updateIncidentStatus} onMaintenance={openMaintenanceForm} /> : <>
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
        {maintenanceIncident && (
          <MaintenanceInvoiceModal
            incident={maintenanceIncident}
            draft={maintenanceDraft}
            onDraftChange={setMaintenanceDraft}
            onSubmit={saveMaintenance}
            onClose={() => setMaintenanceIncident(null)}
            onPreview={() => setShowInvoicePreview((current) => !current)}
            showPreview={showInvoicePreview}
            message={maintenanceMessage}
            onDownload={() => downloadInvoice(maintenanceIncident, invoiceFromDraft(maintenanceDraft))}
            onPrint={() => printInvoice(maintenanceIncident, invoiceFromDraft(maintenanceDraft))}
          />
        )}
    </div>
  )
}

function IncidentQueue({
  incidents,
  onStatusChange,
  onMaintenance,
}: {
  incidents: EquipmentIncident[]
  onStatusChange: (id: string, status: IncidentStatus) => void
  onMaintenance: (incident: EquipmentIncident) => void
}) {
  const severityLabels = { critical: "Nghiêm trọng", medium: "Trung bình", low: "Thấp" }
  const statusLabels = { pending: "Chưa xử lý", in_progress: "Đang xử lý", resolved: "Đã xử lý" }
  const statusStyles = { pending: "text-red-700", in_progress: "text-amber-700", resolved: "text-emerald-700" }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4"><h2 className="font-bold text-slate-900">Báo cáo sự cố</h2><p className="mt-1 text-sm text-slate-500">Cập nhật trạng thái xử lý tại Phòng Đào tạo; giảng viên chỉ theo dõi.</p></div>
      {incidents.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">Chưa có báo cáo sự cố.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...incidents]
            .sort((left, right) => right.reportedAt.localeCompare(left.reportedAt))
            .map((incident) => (
              <li key={incident.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.5fr)_130px_140px_minmax(240px,auto)] lg:items-center">
                <div>
                  <p className="font-semibold text-slate-800">{incident.equipmentName} · Phòng {incident.roomId}</p>
                  <p className="mt-1 text-sm text-slate-600">{incident.issueType} · {incident.description}</p>
                  <p className="mt-1 text-xs text-slate-400">{incident.reportedBy} · {new Date(incident.reportedAt).toLocaleString("vi-VN")}</p>
                  {incident.maintenanceInvoice && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-800">
                      <FileText className="size-3.5" />
                      {incident.maintenanceInvoice.invoiceNumber} · {formatCurrency(incident.maintenanceInvoice.quantity * incident.maintenanceInvoice.unitPrice + incident.maintenanceInvoice.laborCost)}
                    </p>
                  )}
                </div>
                <span className="text-sm text-slate-600">{severityLabels[incident.severity]}</span>
                <span className={`text-sm font-semibold ${statusStyles[incident.status]}`}>{statusLabels[incident.status]}</span>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label={`Cập nhật trạng thái sự cố ${incident.id}`}
                    value={incident.status}
                    onChange={(event) => onStatusChange(incident.id, event.target.value as IncidentStatus)}
                    className="min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="pending">Chưa xử lý</option>
                    <option value="in_progress">Đang xử lý</option>
                    <option value="resolved">Đã xử lý</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => onMaintenance(incident)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50"
                  >
                    <Wrench className="size-4" />
                    {incident.maintenanceInvoice ? "Cập nhật phiếu" : "Bảo trì / hóa đơn"}
                  </button>
                </div>
              </li>
            ))}
        </ul>
      )}
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

function MaintenanceInvoiceModal({
  incident,
  draft,
  onDraftChange,
  onSubmit,
  onClose,
  onPreview,
  showPreview,
  message,
  onDownload,
  onPrint,
}: {
  incident: EquipmentIncident
  draft: MaintenanceDraft
  onDraftChange: (draft: MaintenanceDraft) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
  onPreview: () => void
  showPreview: boolean
  message: string
  onDownload: () => void
  onPrint: () => void
}) {
  const invoice = invoiceFromDraft(draft)
  const invoiceTotal = invoice.quantity * invoice.unitPrice + invoice.laborCost
  const canExport =
    Boolean(invoice.invoiceNumber && invoice.vendor && invoice.description) &&
    Number.isInteger(invoice.quantity) &&
    invoice.quantity > 0 &&
    Number.isFinite(invoice.unitPrice) &&
    invoice.unitPrice >= 0 &&
    Number.isFinite(invoice.laborCost) &&
    invoice.laborCost >= 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="maintenance-title" className="my-auto max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 id="maintenance-title" className="text-lg font-bold text-slate-900">Cập nhật bảo trì và hóa đơn</h2>
            <p className="mt-1 text-sm text-slate-500">{incident.equipmentName} · Phòng {incident.roomId}</p>
          </div>
          <button type="button" aria-label="Đóng phiếu bảo trì" onClick={onClose} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>
        </header>
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Mã hóa đơn / phiếu *
              <input required value={draft.invoiceNumber} onChange={(event) => onDraftChange({ ...draft, invoiceNumber: event.target.value })} className={FIELD_CLASS} />
            </label>
            <label className="text-sm font-medium text-slate-700">Đơn vị bảo trì *
              <input required value={draft.vendor} onChange={(event) => onDraftChange({ ...draft, vendor: event.target.value })} className={FIELD_CLASS} placeholder="Tên đơn vị / nhà cung cấp" />
            </label>
            <label className="text-sm font-medium text-slate-700">Ngày bảo trì *
              <input required type="date" value={draft.maintenanceDate} onChange={(event) => onDraftChange({ ...draft, maintenanceDate: event.target.value })} className={FIELD_CLASS} />
            </label>
            <label className="text-sm font-medium text-slate-700">Nội dung bảo trì *
              <input required value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} className={FIELD_CLASS} placeholder="Ví dụ: thay tụ điều hòa" />
            </label>
            <label className="text-sm font-medium text-slate-700">Số lượng
              <input required type="number" min="1" step="1" value={draft.quantity} onChange={(event) => onDraftChange({ ...draft, quantity: event.target.value })} className={FIELD_CLASS} />
            </label>
            <label className="text-sm font-medium text-slate-700">Đơn giá (VNĐ)
              <input required type="number" min="0" step="1000" value={draft.unitPrice} onChange={(event) => onDraftChange({ ...draft, unitPrice: event.target.value })} className={FIELD_CLASS} />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Chi phí công bảo trì (VNĐ)
              <input required type="number" min="0" step="1000" value={draft.laborCost} onChange={(event) => onDraftChange({ ...draft, laborCost: event.target.value })} className={FIELD_CLASS} />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Ghi chú
            <textarea rows={2} value={draft.notes} onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })} className={`${FIELD_CLASS} resize-y`} placeholder="Linh kiện thay thế, thời hạn bảo hành..." />
          </label>
          {message && <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">{message}</p>}
          {showPreview && (
            <section className="rounded-xl border border-slate-300 bg-white p-5">
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-900">HÓA ĐƠN / PHIẾU BẢO TRÌ THIẾT BỊ</h3>
                <p className="mt-1 text-sm text-slate-500">Mã {invoice.invoiceNumber} · {invoice.maintenanceDate}</p>
              </div>
              <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
                <p><strong>Phòng:</strong> {incident.roomId}</p>
                <p><strong>Thiết bị:</strong> {incident.equipmentName}</p>
                <p><strong>Đơn vị:</strong> {invoice.vendor || "Chưa nhập"}</p>
                <p><strong>Người báo cáo:</strong> {incident.reportedBy}</p>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead><tr className="bg-slate-100"><th className="border border-slate-300 p-2 text-left">Nội dung</th><th className="border border-slate-300 p-2 text-right">SL</th><th className="border border-slate-300 p-2 text-right">Đơn giá</th><th className="border border-slate-300 p-2 text-right">Thành tiền</th></tr></thead>
                  <tbody>
                    <tr><td className="border border-slate-300 p-2">{invoice.description || "Chưa nhập"}</td><td className="border border-slate-300 p-2 text-right">{invoice.quantity || 0}</td><td className="border border-slate-300 p-2 text-right">{formatCurrency(invoice.unitPrice || 0)}</td><td className="border border-slate-300 p-2 text-right">{formatCurrency((invoice.quantity || 0) * (invoice.unitPrice || 0))}</td></tr>
                    <tr><td colSpan={3} className="border border-slate-300 p-2">Công bảo trì</td><td className="border border-slate-300 p-2 text-right">{formatCurrency(invoice.laborCost || 0)}</td></tr>
                  </tbody>
                </table>
              </div>
              {invoice.notes && <p className="mt-3 text-sm"><strong>Ghi chú:</strong> {invoice.notes}</p>}
              <p className="mt-4 text-right text-lg font-bold">Tổng cộng: {formatCurrency(Number.isFinite(invoiceTotal) ? invoiceTotal : 0)}</p>
              <div className="mt-10 flex justify-between text-center text-sm"><p>Đơn vị thực hiện<br /><br /><br />(Ký, ghi rõ họ tên)</p><p>Đại diện quản lý<br /><br /><br />(Ký, ghi rõ họ tên)</p></div>
            </section>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            {showPreview && (
              <>
                <button type="button" disabled={!canExport} onClick={onDownload} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download className="size-4" />Tải file hóa đơn HTML</button>
                <button type="button" disabled={!canExport} onClick={onPrint} className="inline-flex items-center gap-2 rounded-lg border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50"><Printer className="size-4" />In / Lưu PDF</button>
              </>
            )}
            <button type="button" onClick={onPreview} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileText className="size-4" />{showPreview ? "Ẩn bản xem trước" : "Xem trước hóa đơn"}</button>
            <button type="submit" className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">Lưu cập nhật bảo trì</button>
          </div>
          <p className="text-xs text-slate-500">Lưu phiếu sẽ chuyển thiết bị sang trạng thái “Cần bảo trì” và báo cáo sang “Đang xử lý”. Chọn “Đã xử lý” sau khi hoàn tất; hóa đơn có thể in và lưu thành PDF từ hộp thoại in của trình duyệt.</p>
        </form>
      </section>
    </div>
  )
}