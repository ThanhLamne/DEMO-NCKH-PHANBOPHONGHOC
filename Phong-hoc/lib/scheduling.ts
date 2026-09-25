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
  const shift = shiftOfPeriod(startPeriod)
  const startIndex = SHIFT_PERIODS[shift].indexOf(startPeriod)
  const endIndex = SHIFT_PERIODS[shift].indexOf(endPeriod)
  const start = addMinutes(SHIFT_START[shift], startIndex * PERIOD_MINUTES)
  const end = addMinutes(SHIFT_START[shift], (endIndex + 1) * PERIOD_MINUTES)
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

/**
 * Thuật toán sắp xếp:
 * 1. Duyệt lần lượt từ Thứ Hai -> Thứ Bảy.
 * 2. Trong mỗi ngày, ưu tiên lớp sĩ số LỚN nhất trước.
 * 3. Chọn phòng nhỏ nhất mà vẫn đủ sức chứa (best-fit) để dành phòng lớn cho lớp đông.
 * 4. Lớp không đủ phòng / hết chỗ -> đẩy ra danh sách "ngoài".
 */
export function autoSchedule(classes: ClassInfo[], rooms: RoomInfo[]): ScheduleResult {
  const roomFitCount = (cls: ClassInfo): number =>
    rooms.filter((room) => (cls.size >= 150 || !isHallRoom(room)) && room.capacity >= cls.size).length

  const sorted = [...classes].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day
    if (a.shift !== b.shift) return SHIFTS.indexOf(a.shift) - SHIFTS.indexOf(b.shift)
    const aFitCount = roomFitCount(a)
    const bFitCount = roomFitCount(b)
    if (aFitCount !== bFitCount) return aFitCount - bFitCount
    if (a.periods !== b.periods) return b.periods - a.periods
    return b.size - a.size
  })

  const roomsByCapAsc = [...rooms].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "hall" ? -1 : 1
    return a.capacity - b.capacity
  })
  const occupancy: OccupancyMap = new Map()

  const assignments: Assignment[] = []
  const unassigned: Unassigned[] = []

  for (const cls of sorted) {
    const eligibleRooms = roomsByCapAsc.filter((room) => cls.size >= 150 || !isHallRoom(room))

    const placementCandidates: Array<{
      candidateRoom: RoomInfo
      day: number
      shift: Shift
      startPeriod: number
      endPeriod: number
      shortage: number
      preference: number
    }> = []

    for (const day of DAYS) {
      for (const shift of SHIFTS) {
        const shiftPeriods = SHIFT_PERIODS[shift]
        if (cls.periods > shiftPeriods.length) continue

        for (const room of eligibleRooms) {
          const key = occKey(day, room.id)
          const used = occupancy.get(key) ?? new Set<number>()
          const start = findFreeBlock(used, shiftPeriods, cls.periods)
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
      if (a.shortage !== b.shortage) return a.shortage - b.shortage
      if (a.candidateRoom.capacity !== b.candidateRoom.capacity) return a.candidateRoom.capacity - b.candidateRoom.capacity
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
): Assignment | null {
  const alternatives = findAlternatives(cls, rooms, assignments, Number.MAX_SAFE_INTEGER)
  const roomById = new Map(rooms.map((room) => [room.id, room]))
  const selected = alternatives.sort((left, right) => {
    const leftOriginal = left.day === cls.day && left.shift === cls.shift ? 0 : 1
    const rightOriginal = right.day === cls.day && right.shift === cls.shift ? 0 : 1
    if (leftOriginal !== rightOriginal) return leftOriginal - rightOriginal
    const leftRoom = roomById.get(left.roomId)
    const rightRoom = roomById.get(right.roomId)
    const leftShortage = Math.max(0, cls.size - (leftRoom?.capacity ?? 0))
    const rightShortage = Math.max(0, cls.size - (rightRoom?.capacity ?? 0))
    if (leftShortage !== rightShortage) return leftShortage - rightShortage
    return (leftRoom?.capacity ?? 0) - (rightRoom?.capacity ?? 0)
  })[0]

  if (!selected) return null
  const room = roomById.get(selected.roomId)
  return {
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
): AltSlot[] {
  const occupancy = buildOccupancy(assignments)
  const candidateRooms = [...rooms]
    .filter((room) => cls.size >= 150 || !isHallRoom(room))
    .sort((a, b) => {
      const shortageA = Math.max(0, cls.size - a.capacity)
      const shortageB = Math.max(0, cls.size - b.capacity)
      if (shortageA !== shortageB) return shortageA - shortageB
      return a.capacity - b.capacity
    })

  const results: AltSlot[] = []

  for (const day of DAYS) {
    for (const shift of SHIFTS) {
      const shiftPeriods = SHIFT_PERIODS[shift]
      if (cls.periods > shiftPeriods.length) continue

      for (const room of candidateRooms) {
        const used = occupancy.get(occKey(day, room.id)) ?? new Set<number>()
        const start = findFreeBlock(used, shiftPeriods, cls.periods)
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
