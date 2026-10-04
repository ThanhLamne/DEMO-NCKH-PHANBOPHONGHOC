"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BookOpen,
  Building2,
  CalendarDays,
  Clock3,
  DoorOpen,
  Search,
  Wrench,
} from "lucide-react"
import {
  ALLOCATION_UPDATED_EVENT,
  loadAllocationSnapshot,
  type AllocationSnapshot,
} from "@/lib/allocation-store"
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  isBorrowRequestInWeek,
  loadBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store"
import {
  EQUIPMENT_UPDATED_EVENT,
  loadEquipment,
  type EquipmentItem,
} from "@/lib/equipment-store"
import { SHEET_CLASSES, SHEET_ROOMS } from "@/lib/schedule-data"
import {
  autoSchedule,
  DAY_LABELS,
  rangeTime,
  SHIFT_LABELS,
} from "@/lib/scheduling"

type SearchSection = "all" | "classes" | "rooms" | "equipment"

const EQUIPMENT_STATUS: Record<EquipmentItem["status"], string> = {
  active: "Đang hoạt động",
  off: "Đang tắt",
  maintenance: "Bảo trì",
  broken: "Đang hỏng",
  offline: "Mất kết nối",
}

const BORROW_STATUS: Record<BorrowRequest["status"], string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
}

function searchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .trim()
}

function includesQuery(query: string, ...values: Array<string | number | undefined>) {
  if (!query) return true
  const haystack = searchText(values.filter((value) => value !== undefined).join(" "))
  return haystack.includes(query)
}

export function LecturerLookupPanel() {
  const [query, setQuery] = useState("")
  const [section, setSection] = useState<SearchSection>("all")
  const [snapshot, setSnapshot] = useState<AllocationSnapshot | null>(null)
  const [requests, setRequests] = useState<BorrowRequest[]>([])
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])

  useEffect(() => {
    const refreshAllocation = () => setSnapshot(loadAllocationSnapshot())
    const refreshRequests = () => setRequests(loadBorrowRequests())
    const refreshEquipment = () => setEquipment(loadEquipment())

    refreshAllocation()
    refreshRequests()
    refreshEquipment()
    window.addEventListener(ALLOCATION_UPDATED_EVENT, refreshAllocation)
    window.addEventListener(BORROW_REQUESTS_UPDATED_EVENT, refreshRequests)
    window.addEventListener(EQUIPMENT_UPDATED_EVENT, refreshEquipment)
    window.addEventListener("storage", refreshAllocation)
    window.addEventListener("storage", refreshRequests)
    window.addEventListener("storage", refreshEquipment)
    return () => {
      window.removeEventListener(ALLOCATION_UPDATED_EVENT, refreshAllocation)
      window.removeEventListener(BORROW_REQUESTS_UPDATED_EVENT, refreshRequests)
      window.removeEventListener(EQUIPMENT_UPDATED_EVENT, refreshEquipment)
      window.removeEventListener("storage", refreshAllocation)
      window.removeEventListener("storage", refreshRequests)
      window.removeEventListener("storage", refreshEquipment)
    }
  }, [])

  const schedule = useMemo(
    () => snapshot?.result ?? autoSchedule(SHEET_CLASSES, SHEET_ROOMS),
    [snapshot],
  )
  const classes = snapshot?.classes ?? SHEET_CLASSES
  const classById = useMemo(
    () => new Map(classes.map((classInfo) => [classInfo.id, classInfo])),
    [classes],
  )
  const currentWeekRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          request.requesterType === "Giảng viên" &&
          isBorrowRequestInWeek(request),
      ),
    [requests],
  )
  const normalizedQuery = searchText(query)

  const classResults = useMemo(
    () =>
      classes
        .map((classInfo) => {
          const assignments = schedule.assignments.filter(
            (item) => item.classId === classInfo.id,
          )
          return { classInfo, assignments }
        })
        .filter(({ classInfo, assignments }) =>
          includesQuery(
            normalizedQuery,
            classInfo.name,
            classInfo.id,
            classInfo.courseCode,
            classInfo.className,
            classInfo.section,
            classInfo.cohort,
            classInfo.major,
            ...assignments.map((assignment) => assignment.roomId),
          ),
        )
        .slice(0, 12),
    [classes, normalizedQuery, schedule],
  )

  const roomResults = useMemo(
    () =>
      SHEET_ROOMS.filter((room) => {
        const assignedClasses = schedule.assignments
          .filter((assignment) => assignment.roomId === room.id)
          .map((assignment) => classById.get(assignment.classId)?.name)
        const borrowedBy = currentWeekRequests
          .filter((request) => request.roomId === room.id)
          .map((request) => `${request.requester} ${request.courseName ?? ""} ${request.status}`)
        return includesQuery(
          normalizedQuery,
          room.id,
          room.name,
          room.building,
          room.campus,
          room.capacity,
          ...assignedClasses,
          ...borrowedBy,
        )
      }).slice(0, 12),
    [classById, currentWeekRequests, normalizedQuery, schedule],
  )

  const equipmentResults = useMemo(
    () =>
      equipment
        .filter((item) =>
          includesQuery(
            normalizedQuery,
            item.name,
            item.category,
            item.roomId,
            item.status,
            EQUIPMENT_STATUS[item.status],
            item.notes,
          ),
        )
        .slice(0, 12),
    [equipment, normalizedQuery],
  )

  const borrowResults = useMemo(
    () =>
      currentWeekRequests
        .filter((request) =>
          includesQuery(
            normalizedQuery,
            request.requester,
            request.courseName,
            request.className,
            request.purpose,
            request.roomId,
            request.status,
          ),
        )
        .slice(0, 12),
    [currentWeekRequests, normalizedQuery],
  )

  const sections: Array<{
    id: SearchSection
    label: string
    icon: typeof BookOpen
    count: number
  }> = [
    { id: "all", label: "Tất cả", icon: Search, count: classResults.length + roomResults.length + equipmentResults.length + borrowResults.length },
    { id: "classes", label: "Lớp học", icon: BookOpen, count: classResults.length },
    { id: "rooms", label: "Phòng mượn", icon: DoorOpen, count: roomResults.length + borrowResults.length },
    { id: "equipment", label: "Thiết bị", icon: Wrench, count: equipmentResults.length },
  ]

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-6 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-sky-700 text-white">
              <Search className="size-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">Tra cứu lớp, phòng & thiết bị</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Tìm lịch lớp học, phòng được phân bổ hoặc mượn, và thiết bị theo tên, mã lớp, phòng hoặc cơ sở.
            </p>
          </div>
          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm lg:w-[390px]">
            <Search className="size-4 shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nhập tên lớp, mã lớp, phòng, thiết bị..."
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Loại thông tin tra cứu">
        {sections.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            aria-pressed={section === id}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              section === id
                ? "border-sky-700 bg-sky-700 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50"
            }`}
          >
            <Icon className="size-4" />
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${section === id ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
          </button>
        ))}
      </nav>

      {(section === "all" || section === "classes") && (
        <ResultSection title="Lớp học và lịch phòng" icon={BookOpen} empty={classResults.length === 0}>
          {classResults.map(({ classInfo, assignments }) => (
            <article key={classInfo.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-800">{classInfo.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {[classInfo.courseCode, classInfo.className, classInfo.section, classInfo.cohort, classInfo.major]
                      .filter(Boolean)
                      .join(" · ") || `Mã lớp ${classInfo.id}`}
                  </p>
                </div>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  Sĩ số {classInfo.size}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {assignments.length ? assignments.map((assignment) => (
                  <p key={`${classInfo.id}-${assignment.day}-${assignment.roomId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                    <CalendarDays className="size-4 text-slate-400" />
                    {DAY_LABELS[assignment.day] ?? `Thứ ${assignment.day}`} · {SHIFT_LABELS[assignment.shift]}
                    <Clock3 className="ml-1 size-4 text-slate-400" />
                    Tiết {assignment.startPeriod}–{assignment.endPeriod} ({rangeTime(assignment.startPeriod, assignment.endPeriod)})
                    <Building2 className="ml-1 size-4 text-slate-400" />
                    Phòng {assignment.roomId}
                  </p>
                )) : (
                  <p className="text-sm text-amber-700">Chưa có lịch phân phòng cho lớp này.</p>
                )}
              </div>
            </article>
          ))}
        </ResultSection>
      )}

      {(section === "all" || section === "rooms") && (
        <>
          <ResultSection title="Danh sách phòng" icon={Building2} empty={roomResults.length === 0}>
            {roomResults.map((room) => {
              const assignments = schedule.assignments.filter((item) => item.roomId === room.id)
              const roomRequests = borrowResults.filter((request) => request.roomId === room.id)
              return (
                <article key={room.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-800">Phòng {room.id}</h3>
                      <p className="mt-1 text-xs text-slate-500">{room.building ?? "Chưa rõ tòa"} · {room.campus ?? "Chưa rõ cơ sở"}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{room.capacity} chỗ</span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                    {assignments.length ? assignments.slice(0, 3).map((assignment) => (
                      <p key={`${room.id}-${assignment.classId}-${assignment.day}`} className="flex flex-wrap items-center gap-x-2">
                        <BookOpen className="size-4 text-slate-400" />
                        {classById.get(assignment.classId)?.name ?? "Lớp học"} · {DAY_LABELS[assignment.day] ?? `Thứ ${assignment.day}`} · {SHIFT_LABELS[assignment.shift]} · Tiết {assignment.startPeriod}–{assignment.endPeriod}
                      </p>
                    )) : <p>Chưa có lớp được phân bổ trong lịch hiện tại.</p>}
                    {roomRequests.map((request) => (
                      <p key={request.id} className="flex flex-wrap items-center gap-x-2">
                        <DoorOpen className="size-4 text-slate-400" />
                        Mượn phòng: {request.courseName || request.purpose} · {request.requester} · {BORROW_STATUS[request.status]}
                      </p>
                    ))}
                  </div>
                </article>
              )
            })}
          </ResultSection>
          <ResultSection title="Phiếu mượn phòng trong tuần" icon={DoorOpen} empty={borrowResults.length === 0}>
            {borrowResults.map((request) => (
              <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-800">{request.courseName || request.purpose}</h3>
                    <p className="mt-1 text-xs text-slate-500">{request.className || "Chưa ghi tên lớp"} · {request.requester}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.status === "approved" ? "bg-emerald-50 text-emerald-800" : request.status === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                    {BORROW_STATUS[request.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {request.borrowDate ?? `${request.weekKey} · ${DAY_LABELS[request.day] ?? ""}`} · {SHIFT_LABELS[request.shift]} · Tiết {request.startPeriod}–{request.endPeriod}
                  {request.roomId ? ` · Phòng ${request.roomId}` : " · Chưa được xếp phòng"}
                </p>
              </article>
            ))}
          </ResultSection>
        </>
      )}

      {(section === "all" || section === "equipment") && (
        <ResultSection title="Thiết bị theo phòng" icon={Wrench} empty={equipmentResults.length === 0}>
          {equipmentResults.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-800">{item.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{item.category} · Phòng {item.roomId || "chưa gán phòng"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "active" ? "bg-emerald-50 text-emerald-800" : item.status === "broken" || item.status === "offline" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                  {EQUIPMENT_STATUS[item.status]}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Số lượng: {item.quantity}{item.notes ? ` · ${item.notes}` : ""}</p>
            </article>
          ))}
        </ResultSection>
      )}

      <p className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-sky-900">
        Lịch lớp hiện lưu môn/lớp và phòng, chưa có trường tên giảng viên phụ trách. Vì vậy kết quả lớp hiện tra cứu trên toàn bộ lịch; dữ liệu phòng mượn và thiết bị hiển thị theo thông tin đã lưu trong hệ thống.
      </p>
    </div>
  )
}

function ResultSection({
  title,
  icon: Icon,
  empty,
  children,
}: {
  title: string
  icon: typeof BookOpen
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
        <Icon className="size-5 text-sky-700" />
        {title}
      </h2>
      {empty ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          Không tìm thấy kết quả phù hợp.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{children}</div>
      )}
    </section>
  )
}
