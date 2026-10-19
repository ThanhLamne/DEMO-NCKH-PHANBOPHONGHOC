// Mô hình dữ liệu và thuật toán sắp xếp phòng học theo thời khóa biểu.

export type Shift = "morning" | "afternoon" | "evening"

export type RoomInfo = {
  id: string
  name: string
  capacity: number
  building?: string
  campus?: "36 Xuân La" | "371 Nguyễn Hoàng Tôn" | "77 NCT"
  kind?: "classroom" | "hall"
}

export type ClassInfo = {
  id: string
  /** Tên môn / lớp học phần */
  name: string
  /** Sĩ số */
  size: number
  /** Các trường cần bổ sung trước khi phân bổ phòng. */
  needsReview?: string[]
  /** Thứ trong tuần: 2 = Thứ Hai ... 7 = Thứ Bảy */
  day: number
  /** Ca học */
  shift: Shift
  /** Số tiết học liên tục (mỗi tiết 50 phút) */
  periods: number
  /** TKB ban hành: khi có, thuật toán bắt buộc giữ nguyên khung tiết này. */
  startPeriod?: number
  endPeriod?: number
  cohort?: "K23" | "K24" | "K25" | "K26"
  courseCode?: string
  major?: string
  className?: string
  section?: string
}

export function classImportIdentityKey(
  classInfo: Pick<
    ClassInfo,
    | "name"
    | "courseCode"
    | "className"
    | "section"
  >,
): string {
  const normalize = (value: string) => value.trim().toLocaleLowerCase()
  const course = normalize(classInfo.courseCode ?? "") || normalize(classInfo.name)
  let classCode = normalize(classInfo.className ?? "")
  const section = normalize(classInfo.section ?? "")
  if (classCode && section && !classCode.endsWith(`.${section}`)) {
    classCode = `${classCode}.${section}`
  }
  if (classCode) return `${course}|${classCode}`

  const base = course
  if (section) return `${base}|${section}`
  return base
}

export function classImportKey(
  classInfo: Pick<
    ClassInfo,
    | "name"
    | "courseCode"
    | "className"
    | "section"
    | "day"
    | "shift"
    | "startPeriod"
    | "endPeriod"
  >,
): string {
  const identity = classImportIdentityKey(classInfo) || classInfo.name.trim().toLocaleLowerCase()
  return [
    identity,
    classInfo.day,
    classInfo.shift,
    classInfo.startPeriod ?? "",
    classInfo.endPeriod ?? "",
  ].join("|")
}

export type Assignment = {
  classId: string
  roomId: string
  day: number
  shift: Shift
  startPeriod: number
  endPeriod: number
  shortage?: number
}

export type Unassigned = {
  classInfo: ClassInfo
  reason: string
}

export type ScheduleResult = {
  assignments: Assignment[]
  unassigned: Unassigned[]
  reserveBySlot: Record<string, number>
  reserveWarnings: string[]
}

export type AltSlot = {
  day: number
  shift: Shift
  roomId: string
  startPeriod: number
  endPeriod: number
}

export const DAYS = [2, 3, 4, 5, 6, 7] as const

export const DAY_LABELS: Record<number, string> = {
  2: "Thứ Hai",
  3: "Thứ Ba",
  4: "Thứ Tư",
  5: "Thứ Năm",
  6: "Thứ Sáu",
  7: "Thứ Bảy",
}

export const DAY_SHORT: Record<number, string> = {
  2: "T2",
  3: "T3",
  4: "T4",
  5: "T5",
  6: "T6",
  7: "T7",
}

export const SHIFTS: Shift[] = ["morning", "afternoon", "evening"]

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: "Sáng",
  afternoon: "Chiều",
  evening: "Tối",
}

export const CAMPUS_LABELS = {
  all: "Tất cả cơ sở",
  "36 Xuân La": "Cơ sở 36 Xuân La",
  "371 Nguyễn Hoàng Tôn": "Cơ sở 371 Nguyễn Hoàng Tôn",
  "77 NCT": "Cơ sở 3 - 77 NCT",
} as const

export type CampusFilter = keyof typeof CAMPUS_LABELS

export type CohortFilter = "all" | "K23" | "K24" | "K25" | "K26"

export const COHORT_LABELS: Record<CohortFilter, string> = {
  all: "Tất cả khóa",
  K23: "Khóa 23",
  K24: "Khóa 24",
  K25: "Khóa 25",
  K26: "Khóa 26",
}

/** Các tiết thuộc từng ca. Sáng 1-5, Chiều 6-10, Tối 11-13. */
export const SHIFT_PERIODS: Record<Shift, number[]> = {
  morning: [1, 2, 3, 4, 5],
  afternoon: [6, 7, 8, 9, 10],
  evening: [11, 12, 13],
}

const PERIOD_MINUTES = 50

/** Giờ bắt đầu của tiết 1, tiết 6, tiết 11 (đầu mỗi ca). */
const SHIFT_START: Record<Shift, string> = {
  morning: "07:00",
  afternoon: "13:00",
  evening: "18:00",
}

function shiftOfPeriod(period: number): Shift {
  if (period <= 5) return "morning"
  if (period <= 10) return "afternoon"
  return "evening"
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

/** Khoảng giờ thực tế của 1 tiết, ví dụ tiết 1 -> "07:00 - 07:50". */
export function periodTime(period: number): string {
  const shift = shiftOfPeriod(period)
  const indexInShift = SHIFT_PERIODS[shift].indexOf(period)
  const start = addMinutes(SHIFT_START[shift], indexInShift * PERIOD_MINUTES)
  const end = addMinutes(start, PERIOD_MINUTES)
  return `${start} - ${end}`
}

/** Khoảng giờ từ tiết bắt đầu đến tiết kết thúc. */
export function rangeTime(startPeriod: number, endPeriod: number): string {
  const start = periodTime(startPeriod).split(" - ")[0]
  const end = periodTime(endPeriod).split(" - ")[1]
  return `${start} - ${end}`
}

/** 20 phòng học: sức chứa 40 / 60 / 100. */
export function createRooms(): RoomInfo[] {
  return [
    { id: "A101", name: "A101", capacity: 40 },
    { id: "A102", name: "A102", capacity: 60 },
    { id: "A103", name: "A103", capacity: 100 },
    { id: "A104", name: "A104", capacity: 40 },
    { id: "A105", name: "A105", capacity: 60 },
    { id: "A106", name: "A106", capacity: 100 },
    { id: "A107", name: "A107", capacity: 40 },
    { id: "A108", name: "A108", capacity: 60 },
    { id: "A109", name: "A109", capacity: 100 },
    { id: "A110", name: "A110", capacity: 40 },
    { id: "B101", name: "B101", capacity: 60 },
    { id: "B102", name: "B102", capacity: 100 },
    { id: "B103", name: "B103", capacity: 40 },
    { id: "B104", name: "B104", capacity: 60 },
    { id: "B105", name: "B105", capacity: 100 },
    { id: "B106", name: "B106", capacity: 40 },
    { id: "B107", name: "B107", capacity: 60 },
    { id: "B108", name: "B108", capacity: 100 },
    { id: "B109", name: "B109", capacity: 40 },
    { id: "B110", name: "B110", capacity: 60 },
  ]
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `cls-${idCounter}`
}

/**
 * Thời khóa biểu mẫu có sẵn. Cố tình tạo nhiều lớp sĩ số lớn trong cùng ca
 * để minh họa trường hợp thiếu phòng -> lớp bị "đẩy ra ngoài".
 */
export function createInitialClasses(): ClassInfo[] {
  idCounter = 0
  const raw: Omit<ClassInfo, "id">[] = [
    // Thứ Hai - sáng: nhiều lớp sĩ số lớn (chỉ có 6 phòng 100 chỗ)
    { name: "Triết học Mác - Lênin", size: 95, day: 2, shift: "morning", periods: 3 },
    { name: "Kinh tế chính trị", size: 92, day: 2, shift: "morning", periods: 3 },
    { name: "Tư tưởng Hồ Chí Minh", size: 90, day: 2, shift: "morning", periods: 2 },
    { name: "Lịch sử Đảng CSVN", size: 88, day: 2, shift: "morning", periods: 2 },
    { name: "Pháp luật đại cương", size: 85, day: 2, shift: "morning", periods: 3 },
    { name: "Nhập môn Hành chính học", size: 82, day: 2, shift: "morning", periods: 2 },
    { name: "Kỹ năng giao tiếp công vụ", size: 78, day: 2, shift: "morning", periods: 2 },
    { name: "Xã hội học đại cương", size: 91, day: 2, shift: "morning", periods: 3 },
    { name: "Tâm lý học quản lý", size: 89, day: 2, shift: "morning", periods: 3 },
    { name: "Hành chính học so sánh", size: 87, day: 2, shift: "morning", periods: 3 },
    { name: "Chính trị học đại cương", size: 90, day: 2, shift: "morning", periods: 3 },
    { name: "Luật Dân sự", size: 86, day: 2, shift: "morning", periods: 2 },
    { name: "Tin học văn phòng", size: 55, day: 2, shift: "morning", periods: 3 },
    { name: "Tiếng Anh chuyên ngành 1", size: 38, day: 2, shift: "morning", periods: 2 },
    // Thứ Hai - chiều
    { name: "Luật Hành chính", size: 90, day: 2, shift: "afternoon", periods: 3 },
    { name: "Quản trị Văn phòng", size: 58, day: 2, shift: "afternoon", periods: 2 },
    { name: "Văn bản & Lưu trữ học", size: 36, day: 2, shift: "afternoon", periods: 2 },
    // Thứ Hai - tối
    { name: "Anh văn B1 (VB2)", size: 42, day: 2, shift: "evening", periods: 2 },
    // Thứ Ba
    { name: "Khoa học quản lý", size: 95, day: 3, shift: "morning", periods: 3 },
    { name: "Tổ chức bộ máy nhà nước", size: 84, day: 3, shift: "morning", periods: 2 },
    { name: "Kinh tế học công cộng", size: 56, day: 3, shift: "morning", periods: 2 },
    { name: "Thống kê ứng dụng", size: 39, day: 3, shift: "afternoon", periods: 3 },
    { name: "Quản lý nhân sự khu vực công", size: 60, day: 3, shift: "afternoon", periods: 2 },
    // Thứ Tư
    { name: "Chính sách công", size: 92, day: 4, shift: "morning", periods: 3 },
    { name: "Luật Hiến pháp", size: 80, day: 4, shift: "morning", periods: 2 },
    { name: "Phương pháp NCKH", size: 44, day: 4, shift: "afternoon", periods: 2 },
    // Thứ Năm
    { name: "Tài chính công", size: 86, day: 5, shift: "morning", periods: 3 },
    { name: "Quản lý dự án công", size: 58, day: 5, shift: "afternoon", periods: 2 },
    // Thứ Sáu
    { name: "Đạo đức công vụ", size: 75, day: 6, shift: "morning", periods: 2 },
    { name: "Kỹ năng soạn thảo văn bản", size: 40, day: 6, shift: "afternoon", periods: 2 },
    // Thứ Bảy
    { name: "Chuyên đề thực tế", size: 100, day: 7, shift: "morning", periods: 3 },
  ]
  return raw.map((c) => ({ ...c, id: nextId() }))
}

export function createClassId(): string {
  return nextId()
}

type OccupancyMap = Map<string, Set<number>>

function occKey(day: number, roomId: string): string {
  return `${day}::${roomId}`
}

/** Tìm khối `periods` tiết liên tục còn trống trong ca; trả về tiết bắt đầu hoặc null. */
function findFreeBlock(used: Set<number>, shiftPeriods: number[], periods: number): number | null {
  for (let i = 0; i + periods <= shiftPeriods.length; i++) {
    let ok = true
    for (let k = 0; k < periods; k++) {
      if (used.has(shiftPeriods[i + k])) {
        ok = false
        break
      }
    }
    if (ok) return shiftPeriods[i]
  }
  return null
}

function isHallRoom(room: RoomInfo): boolean {
  return room.kind === "hall" || room.building === "HoiTruong" || room.name.toLocaleUpperCase().startsWith("HT-")
}

function hasFixedPeriodValues(cls: ClassInfo): boolean {
  return Number.isInteger(cls.startPeriod) && Number.isInteger(cls.endPeriod)
}

function hasValidFixedPeriodRange(cls: ClassInfo): boolean {
  return hasFixedPeriodValues(cls) &&
    cls.startPeriod! >= 1 &&
    cls.endPeriod! <= 13 &&
    cls.endPeriod! >= cls.startPeriod! &&
    cls.endPeriod! - cls.startPeriod! + 1 === cls.periods
}

function schedulingPass(cls: ClassInfo): number {
  if (cls.size >= 150) return 0
  if (cls.size >= 90) return 1
  return 2
}

function compareClassesForScheduling(left: ClassInfo, right: ClassInfo): number {
  return (
    schedulingPass(left) - schedulingPass(right) ||
    right.size - left.size ||
    right.periods - left.periods ||
    left.day - right.day ||
    SHIFTS.indexOf(left.shift) - SHIFTS.indexOf(right.shift)
  )
}

function compareRoomFit(size: number, left: RoomInfo, right: RoomInfo): number {
  if (size < 150) {
    const hallDifference = Number(isHallRoom(left)) - Number(isHallRoom(right))
    if (hallDifference !== 0) return hallDifference
  }
  const leftShortage = Math.max(0, size - left.capacity)
  const rightShortage = Math.max(0, size - right.capacity)
  if (leftShortage !== rightShortage) return leftShortage - rightShortage
  if (size >= 150) {
    const hallDifference = Number(isHallRoom(right)) - Number(isHallRoom(left))
    if (hallDifference !== 0) return hallDifference
    return right.capacity - left.capacity
  }
  return left.capacity - right.capacity
}

/**
 * Giữ nguyên khung tiết cố định của TKB, xếp lớp đông và khó bố trí trước,
 * rồi dùng hội trường cho lớp rất đông và best-fit cho các lớp còn lại.
 */
export function autoSchedule(classes: ClassInfo[], rooms: RoomInfo[]): ScheduleResult {
  // Sweep fixed intervals by start time to avoid room fragmentation from size-only ordering.
  const sorted = [...classes].sort((a, b) => {
    const leftFixed = hasFixedPeriodValues(a)
    const rightFixed = hasFixedPeriodValues(b)
    if (leftFixed !== rightFixed) return leftFixed ? -1 : 1
    if (leftFixed && rightFixed) {
      if (a.day !== b.day) return a.day - b.day
      if (a.startPeriod !== b.startPeriod) return a.startPeriod! - b.startPeriod!
      if (a.endPeriod !== b.endPeriod) return b.endPeriod! - a.endPeriod!
    }
    return compareClassesForScheduling(a, b)
  })

  const roomsByCapAsc = [...rooms].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "hall" ? -1 : 1
    return a.capacity - b.capacity
  })
  const occupancy: OccupancyMap = new Map()

  const assignments: Assignment[] = []
  const unassigned: Unassigned[] = []

  for (const cls of sorted) {
    if (cls.size < 1 || cls.needsReview?.length) {
      unassigned.push({
        classInfo: cls,
        reason: `Chưa thể xếp phòng cho ${cls.name}: cần bổ sung ${cls.needsReview?.join(", ") || "sĩ số"} trước.`,
      })
      continue
    }

    const eligibleRooms = roomsByCapAsc
    const hasFixedPeriods = hasFixedPeriodValues(cls)
    if (hasFixedPeriods && !hasValidFixedPeriodRange(cls)) {
      unassigned.push({
        classInfo: cls,
        reason: `Tiết cố định của lớp ${cls.name} không hợp lệ; hãy kiểm tra lại thời khóa biểu.`,
      })
      continue
    }

    const placementCandidates: Array<{
      candidateRoom: RoomInfo
      day: number
      shift: Shift
      startPeriod: number
      endPeriod: number
      shortage: number
      preference: number
    }> = []

    for (const day of hasFixedPeriods ? [cls.day] : DAYS) {
      for (const shift of hasFixedPeriods ? [cls.shift] : SHIFTS) {
        const shiftPeriods = SHIFT_PERIODS[shift]
        if (!hasFixedPeriods && cls.periods > shiftPeriods.length) continue

        for (const room of eligibleRooms) {
          const key = occKey(day, room.id)
          const used = occupancy.get(key) ?? new Set<number>()
          const start = hasFixedPeriods
            ? [...Array(cls.periods)].every(
                (_, index) => !used.has(cls.startPeriod! + index),
              )
              ? cls.startPeriod!
              : null
            : findFreeBlock(used, shiftPeriods, cls.periods)
          if (start === null) continue

          const sameOriginalSlot = day === cls.day && shift === cls.shift
          const preference = sameOriginalSlot ? 0 : 1
          const shortage = Math.max(0, cls.size - room.capacity)

          placementCandidates.push({
            candidateRoom: room,
            day,
            shift,
            startPeriod: start,
            endPeriod: start + cls.periods - 1,
            shortage,
            preference,
          })
        }
      }
    }

    const chosen = placementCandidates.sort((a, b) => {
      if (a.preference !== b.preference) return a.preference - b.preference
      const roomPreference = compareRoomFit(
        cls.size,
        a.candidateRoom,
        b.candidateRoom,
      )
      if (roomPreference !== 0) return roomPreference
      return a.day - b.day
    })[0]

    if (!chosen) {
      unassigned.push({
        classInfo: cls,
        reason: `Không tìm thấy khung giờ/phòng phù hợp cho ${cls.name}. Hệ thống đã chấp nhận phòng chật hơn nhưng toàn bộ lịch vẫn đã đầy.`,
      })
      continue
    }

    const key = occKey(chosen.day, chosen.candidateRoom.id)
    const used = occupancy.get(key) ?? new Set<number>()
    for (let p = chosen.startPeriod; p <= chosen.endPeriod; p++) used.add(p)
    occupancy.set(key, used)

    assignments.push({
      classId: cls.id,
      roomId: chosen.candidateRoom.id,
      day: chosen.day,
      shift: chosen.shift,
      startPeriod: chosen.startPeriod,
      endPeriod: chosen.endPeriod,
      shortage: chosen.shortage || undefined,
    })
  }

  return buildScheduleResult(assignments, unassigned, rooms)
}

function buildScheduleResult(
  assignments: Assignment[],
  unassigned: Unassigned[],
  rooms: RoomInfo[],
): ScheduleResult {
  const reserveBySlot: Record<string, number> = {}
  const reserveWarnings: string[] = []
  for (const day of DAYS) {
    for (const shift of ["morning", "afternoon"] as Shift[]) {
      const usedRooms = new Set(
        assignments.filter((a) => a.day === day && a.shift === shift).map((a) => a.roomId),
      )
      const key = `${day}::${shift}`
      reserveBySlot[key] = rooms.length - usedRooms.size
      if (reserveBySlot[key] < 18) {
        reserveWarnings.push(`${DAY_LABELS[day]} ca ${SHIFT_LABELS[shift]} chỉ còn ${reserveBySlot[key]} phòng dự trù (mục tiêu ≥ 18).`)
      }
    }
  }

  return { assignments, unassigned, reserveBySlot, reserveWarnings }
}

/** Tìm một slot mới cho lớp phát sinh mà không thay đổi các assignment đã có. */
export function findIncrementalAssignment(
  cls: ClassInfo,
  rooms: RoomInfo[],
  assignments: Assignment[],
  allowHallFallback = false,
): Assignment | null {
  if (cls.size < 1 || cls.needsReview?.length) return null

  const hasFixedPeriods = hasFixedPeriodValues(cls)
  if (hasFixedPeriods && !hasValidFixedPeriodRange(cls)) return null
  const alternatives = hasFixedPeriods
    ? rooms
        .filter((room) => {
            if (cls.size < 150 && isHallRoom(room) && !allowHallFallback) return false
          return !assignments.some(
            (assignment) =>
              assignment.day === cls.day &&
              assignment.roomId === room.id &&
              assignment.startPeriod <= cls.endPeriod! &&
              cls.startPeriod! <= assignment.endPeriod,
          )
        })
        .map((room) => ({
          day: cls.day,
          shift: cls.shift,
          roomId: room.id,
          startPeriod: cls.startPeriod!,
          endPeriod: cls.endPeriod!,
        }))
    : findAlternatives(
        cls,
        rooms,
        assignments,
        Number.MAX_SAFE_INTEGER,
        allowHallFallback,
      )
  const roomById = new Map(rooms.map((room) => [room.id, room]))
  const selected = alternatives.sort((left, right) => {
    const leftOriginal = left.day === cls.day && left.shift === cls.shift ? 0 : 1
    const rightOriginal = right.day === cls.day && right.shift === cls.shift ? 0 : 1
    if (leftOriginal !== rightOriginal) return leftOriginal - rightOriginal
    return compareRoomFit(
      cls.size,
      roomById.get(left.roomId)!,
      roomById.get(right.roomId)!,
    )
  })[0]

  if (!selected) return null
  const room = roomById.get(selected.roomId)
  return {
    classId: cls.id,
    ...selected,
    shortage: Math.max(0, cls.size - (room?.capacity ?? 0)) || undefined,
  }
}

/** Thêm một lớp vào lịch đã chốt, chỉ sử dụng tài nguyên còn trống. */
export function addClassIncrementally(
  cls: ClassInfo,
  rooms: RoomInfo[],
  current: ScheduleResult,
): ScheduleResult {
  const assignment = findIncrementalAssignment(cls, rooms, current.assignments)
  if (!assignment) {
    return buildScheduleResult(current.assignments, [
      ...current.unassigned,
      {
        classInfo: cls,
        reason: `Không còn phòng/khung giờ trống để xếp lớp ${cls.name}. Các lớp đã phân trước đó được giữ nguyên.`,
      },
    ], rooms)
  }

  return buildScheduleResult([...current.assignments, assignment], current.unassigned, rooms)
}

/** Xếp các lớp chưa có assignment vào slot trống, giữ nguyên mọi assignment đã lưu. */
export function schedulePendingClasses(
  classes: ClassInfo[],
  rooms: RoomInfo[],
  current: ScheduleResult,
): ScheduleResult {
  const assignedIds = new Set(current.assignments.map((assignment) => assignment.classId))
  const pending = classes
    .filter((classInfo) => !assignedIds.has(classInfo.id))
    .sort(compareClassesForScheduling)

  const assignments = [...current.assignments]
  const unassigned: Unassigned[] = []
  for (const classInfo of pending) {
    const assignment = findIncrementalAssignment(
      classInfo,
      rooms,
      assignments,
      true,
    )
    if (!assignment) {
      unassigned.push({
        classInfo,
        reason:
          classInfo.size < 1 || classInfo.needsReview?.length
            ? `Chưa thể xếp phòng cho ${classInfo.name}: cần bổ sung ${classInfo.needsReview?.join(", ") || "sĩ số"} trước.`
            : `Không còn khung giờ/phòng trống phù hợp cho ${classInfo.name}. Các lịch đã phân trước đó được giữ nguyên.`,
      })
      continue
    }
    assignments.push(assignment)
  }

  return buildScheduleResult(assignments, unassigned, rooms)
}

/** Gỡ lịch trong một phòng/ca đã chọn và đưa các lớp bị gỡ về trạng thái chưa xếp. */
export function releaseRoomAssignments(
  roomId: string,
  day: number,
  shift: Shift,
  classes: ClassInfo[],
  rooms: RoomInfo[],
  current: ScheduleResult,
): ScheduleResult {
  const released = current.assignments.filter(
    (assignment) =>
      assignment.roomId === roomId &&
      assignment.day === day &&
      assignment.shift === shift,
  )
  if (released.length === 0) return current

  const releasedIds = new Set(released.map((assignment) => assignment.classId))
  const classById = new Map(classes.map((classInfo) => [classInfo.id, classInfo]))
  const unassigned = current.unassigned.filter(
    (item) => !releasedIds.has(item.classInfo.id),
  )

  for (const assignment of released) {
    const classInfo = classById.get(assignment.classId)
    if (!classInfo) continue
    unassigned.push({
      classInfo,
      reason: `Lịch của lớp ${classInfo.name} đã được quản trị viên gỡ khỏi phòng ${roomId}; lớp đang chờ được xếp lại.`,
    })
  }

  return buildScheduleResult(
    current.assignments.filter((assignment) => !releasedIds.has(assignment.classId)),
    unassigned,
    rooms,
  )
}

/** Gỡ một lớp khỏi lịch đã chốt mà không đụng tới các assignment còn lại. */
export function removeClassFromSchedule(
  classId: string,
  rooms: RoomInfo[],
  current: ScheduleResult,
): ScheduleResult {
  return buildScheduleResult(
    current.assignments.filter((assignment) => assignment.classId !== classId),
    current.unassigned.filter((item) => item.classInfo.id !== classId),
    rooms,
  )
}

/** Dựng lại bản đồ occupancy từ danh sách assignment hiện có. */
function buildOccupancy(assignments: Assignment[]): OccupancyMap {
  const occupancy: OccupancyMap = new Map()
  for (const a of assignments) {
    const key = occKey(a.day, a.roomId)
    const used = occupancy.get(key) ?? new Set<number>()
    for (let p = a.startPeriod; p <= a.endPeriod; p++) used.add(p)
    occupancy.set(key, used)
  }
  return occupancy
}

/** Tìm các phòng và khung ngày/ca còn trống để xếp thủ công lớp chưa được phân bổ. */
export function findAlternatives(
  cls: ClassInfo,
  rooms: RoomInfo[],
  assignments: Assignment[],
  limit = 6,
  allowHallFallback = false,
): AltSlot[] {
  if (cls.size < 1 || cls.needsReview?.length) return []

  const occupancy = buildOccupancy(assignments)
  const hasFixedPeriods = hasFixedPeriodValues(cls)
  if (hasFixedPeriods && !hasValidFixedPeriodRange(cls)) return []
  const candidateRooms = [...rooms]
    .filter(
      (room) =>
        cls.size >= 150 ||
        allowHallFallback ||
        !isHallRoom(room),
    )
    .sort((a, b) => compareRoomFit(cls.size, a, b))

  const results: AltSlot[] = []

  for (const day of hasFixedPeriods ? [cls.day] : DAYS) {
    for (const shift of hasFixedPeriods ? [cls.shift] : SHIFTS) {
      const shiftPeriods = SHIFT_PERIODS[shift]
      if (!hasFixedPeriods && cls.periods > shiftPeriods.length) continue

      for (const room of candidateRooms) {
        const used = occupancy.get(occKey(day, room.id)) ?? new Set<number>()
        const start = hasFixedPeriods
          ? [...Array(cls.periods)].every(
              (_, index) => !used.has(cls.startPeriod! + index),
            )
            ? cls.startPeriod!
            : null
          : findFreeBlock(used, shiftPeriods, cls.periods)
        if (start === null) continue
        const end = start + cls.periods - 1
        if ([...Array(end - start + 1)].every((_, index) => !used.has(start + index))) {
          results.push({ day, shift, roomId: room.id, startPeriod: start, endPeriod: end })
        }
        if (results.length >= limit) return results
      }
    }
  }
  return results
}
