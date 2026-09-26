"use client"

import { useEffect, useMemo, useState } from "react"
import { Building2, CalendarDays, CheckCircle2, Clock3, UserRound } from "lucide-react"
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  isBorrowRequestInWeek,
  loadBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store"
import { DAY_LABELS, SHIFT_LABELS, rangeTime } from "@/lib/scheduling"
import { SHEET_ROOMS } from "@/lib/schedule-data"

export function RoomManagementPanel() {
  const [requests, setRequests] = useState<BorrowRequest[]>([])

  useEffect(() => {
    const refresh = () => setRequests(loadBorrowRequests())
    refresh()
    window.addEventListener(BORROW_REQUESTS_UPDATED_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(BORROW_REQUESTS_UPDATED_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  const approvedRequests = useMemo(
    () => requests.filter((request) => isBorrowRequestInWeek(request) && request.status === "approved" && request.roomId),
    [requests],
  )

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Building2 className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-emerald-950">Quản lý phòng học</h2>
            <p className="mt-1 text-sm text-emerald-800">
              Danh sách phòng đã được duyệt mượn và đang được sử dụng.
            </p>
          </div>
          <span className="ml-auto rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
            {approvedRequests.length} lượt đã duyệt
          </span>
        </div>
      </section>

      {approvedRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Chưa có phòng nào được duyệt mượn.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {approvedRequests.map((request) => {
            const room = SHEET_ROOMS.find((item) => item.id === request.roomId)
            return (
              <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="size-5 text-emerald-600" />
                      <h3 className="text-xl font-bold text-slate-800">Phòng {request.roomId}</h3>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {room?.campus} · {room?.building} · {room?.capacity} chỗ
                    </p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="size-3.5" /> Đã duyệt
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <p className="flex items-center gap-2"><UserRound className="size-4 text-slate-400" />{request.requester} ({request.requesterType})</p>
                  <p className="flex items-center gap-2"><CalendarDays className="size-4 text-slate-400" />{request.borrowDate ? `${request.borrowDate} · ` : ""}{DAY_LABELS[request.day]} · Ca {SHIFT_LABELS[request.shift]}</p>
                  <p className="flex items-center gap-2"><Clock3 className="size-4 text-slate-400" />{rangeTime(request.startPeriod, request.endPeriod)}</p>
                  <p className="text-slate-500">{request.courseName ? `${request.courseName}${request.className ? ` · ${request.className}` : ""} · ` : ""}{request.size} người · {request.purpose}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
