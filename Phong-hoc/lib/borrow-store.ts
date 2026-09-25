import type { Shift } from "./scheduling"

export type BorrowRequestStatus = "pending" | "approved" | "rejected"

export type BorrowRequest = {
  id: string
  requester: string
  requesterType: "Giảng viên" | "Sinh viên"
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

export const DEFAULT_BORROW_REQUESTS: BorrowRequest[] = [
  {
    id: "borrow-demo-1",
    requester: "Nguyễn Thị Minh",
    requesterType: "Giảng viên",
    purpose: "Bù tiết môn Quản lý hành chính",
    day: 6,
    shift: "afternoon",
    startPeriod: 6,
    endPeriod: 8,
    size: 42,
    status: "pending",
  },
  {
    id: "borrow-demo-2",
    requester: "Trần Văn An",
    requesterType: "Sinh viên",
    purpose: "Sinh hoạt nhóm nghiên cứu",
    day: 7,
    shift: "morning",
    startPeriod: 2,
    endPeriod: 3,
    size: 28,
    status: "pending",
  },
]

export function loadBorrowRequests(): BorrowRequest[] {
  if (typeof window === "undefined") return DEFAULT_BORROW_REQUESTS
  const raw = window.localStorage.getItem(BORROW_REQUESTS_STORAGE_KEY)
  if (!raw) return DEFAULT_BORROW_REQUESTS
  try {
    return JSON.parse(raw) as BorrowRequest[]
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

export function addBorrowRequest(request: Omit<BorrowRequest, "id" | "status">): BorrowRequest {
  const nextRequest: BorrowRequest = {
    ...request,
    id: `borrow-${Date.now()}`,
    status: "pending",
  }
  saveBorrowRequests([...loadBorrowRequests(), nextRequest])
  return nextRequest
}
