import type { Shift } from "./scheduling"
import { rangeTime } from "./scheduling"

export type BorrowRequestStatus = "pending" | "approved" | "rejected"

export type BorrowRequest = {
  id: string
  weekKey: string
  requester: string
  requesterType: "Giảng viên" | "Sinh viên"
  courseName?: string
  className?: string
  borrowDate?: string
  purpose: string
  day: number
  shift: Shift
  startPeriod: number
  endPeriod: number
  size: number
  status: BorrowRequestStatus
  roomId?: string
}

export const BORROW_REQUESTS_STORAGE_KEY = "apag-borrow-requests-v1"
export const BORROW_REQUESTS_UPDATED_EVENT = "apag-borrow-requests-updated"

export function getWeekKey(value = new Date()): string {
  const date = new Date(value)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  date.setHours(0, 0, 0, 0)
  return date.toISOString().slice(0, 10)
}

export function getSchedulingDay(value = new Date()): number {
  return new Date(value).getDay() + 1
}

export function isBorrowRequestInWeek(
  request: BorrowRequest,
  weekKey = getWeekKey(),
): boolean {
  return request.weekKey === weekKey
}

function dateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function borrowDateKey(request: BorrowRequest): string {
  if (request.borrowDate) return request.borrowDate
  const weekStart = new Date(`${request.weekKey}T00:00:00`)
  const dayOffset = request.day - 2
  weekStart.setDate(weekStart.getDate() + dayOffset)
  return dateKey(weekStart)
}

export function isBorrowRequestActiveAt(
  request: BorrowRequest,
  value = new Date(),
): boolean {
  if (request.status !== "approved" || !request.roomId) return false
  if (borrowDateKey(request) !== dateKey(value)) return false

  const [start, end] = rangeTime(request.startPeriod, request.endPeriod).split(
    " - ",
  )
  const currentMinutes = value.getHours() * 60 + value.getMinutes()
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number)
    return hours * 60 + minutes
  }
  return currentMinutes >= toMinutes(start) && currentMinutes < toMinutes(end)
}

const CURRENT_WEEK_KEY = getWeekKey()

export const DEFAULT_BORROW_REQUESTS: BorrowRequest[] = []

export function loadBorrowRequests(): BorrowRequest[] {
  if (typeof window === "undefined") return DEFAULT_BORROW_REQUESTS
  const raw = window.localStorage.getItem(BORROW_REQUESTS_STORAGE_KEY)
  if (!raw) return DEFAULT_BORROW_REQUESTS
  try {
    const requests = JSON.parse(raw) as Array<Partial<BorrowRequest> & Pick<BorrowRequest, "id">>
    return requests.map((request) => ({
      ...request,
      weekKey: request.weekKey ?? CURRENT_WEEK_KEY,
    })).filter((request) => !["borrow-demo-1", "borrow-demo-2"].includes(request.id)) as BorrowRequest[]
  } catch {
    window.localStorage.removeItem(BORROW_REQUESTS_STORAGE_KEY)
    return DEFAULT_BORROW_REQUESTS
  }
}

export function saveBorrowRequests(requests: BorrowRequest[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(BORROW_REQUESTS_STORAGE_KEY, JSON.stringify(requests))
  window.dispatchEvent(new Event(BORROW_REQUESTS_UPDATED_EVENT))
}

export function addBorrowRequest(
  request: Omit<BorrowRequest, "id" | "status" | "weekKey"> & { weekKey?: string },
): BorrowRequest {
  const nextRequest: BorrowRequest = {
    ...request,
    weekKey: request.weekKey ?? getWeekKey(),
    id: `borrow-${Date.now()}`,
    status: "pending",
  }
  saveBorrowRequests([...loadBorrowRequests(), nextRequest])
  return nextRequest
}
