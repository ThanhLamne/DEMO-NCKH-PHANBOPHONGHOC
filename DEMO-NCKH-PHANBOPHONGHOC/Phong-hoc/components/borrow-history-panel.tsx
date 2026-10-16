"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  DoorOpen,
  FileText,
  RefreshCw,
  XCircle,
} from "lucide-react"
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  loadBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store"
import { DAY_LABELS, SHIFT_LABELS } from "@/lib/scheduling"

export function BorrowHistoryPanel({
  requesterType,
}: {
  requesterType?: "Giảng viên" | "Sinh viên"
}) {
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

  function refreshHistory() {
    setRequests(loadBorrowRequests())
  }

  const history = useMemo(() => {
    return requests
      .filter((request) => {
        if (!requesterType) return true
        return request.requesterType === requesterType
      })
      .sort((a, b) => {
        const tA = a.borrowDate ? new Date(`${a.borrowDate}T12:00:00`).getTime() : 0
        const tB = b.borrowDate ? new Date(`${b.borrowDate}T12:00:00`).getTime() : 0
        return tB - tA
      })
  }, [requests, requesterType])

  const stats = useMemo(
    () => ({
      total: history.length,
      pending: history.filter((request) => request.status === "pending").length,
      approved: history.filter((request) => request.status === "approved").length,
      rejected: history.filter((request) => request.status === "rejected").length,
    }),
    [history],
  )

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
              <FileText className="size-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">
              Lịch sử mượn phòng
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Theo dõi các yêu cầu mượn phòng, trạng thái duyệt và phòng được phân bổ cho từng đơn.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {requesterType && (
              <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-violet-700">
                {requesterType}
              </span>
            )}
            <button
              type="button"
              onClick={refreshHistory}
              aria-label="Làm mới lịch sử mượn phòng"
              className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <RefreshCw className="size-4" />
              Làm mới
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatBox label="Tổng đơn" value={stats.total} tone="violet" />
        <StatBox label="Chờ duyệt" value={stats.pending} tone="amber" />
        <StatBox label="Đã duyệt" value={stats.approved} tone="emerald" />
        <StatBox label="Từ chối" value={stats.rejected} tone="red" />
      </div>

      {history.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
          <Clock3 className="mx-auto mb-3 size-8 text-slate-400" />
          <p className="text-lg font-semibold text-slate-700">Chưa có lịch sử mượn phòng</p>
          <p className="mt-2 text-sm text-slate-500">
            Các phiếu mượn mới sẽ xuất hiện ở đây sau khi bạn gửi yêu cầu hoặc admin xử lý.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((request) => {
            const statusMeta =
              request.status === "approved"
                ? {
                    label: "Đã duyệt",
                    color: "bg-emerald-100 text-emerald-700",
                    detail: request.roomId
                      ? `Được phê duyệt tại phòng ${request.roomId}`
                      : "Đã duyệt",
                  }
                : request.status === "rejected"
                  ? {
                      label: "Từ chối",
                      color: "bg-red-100 text-red-700",
                      detail: "Yêu cầu không được chấp thuận",
                    }
                  : {
                      label: "Chờ duyệt",
                      color: "bg-amber-100 text-amber-700",
                      detail: "Đã gửi lên quản trị viên",
                    }

            return (
              <article
                key={request.id}
                className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {request.requesterType}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusMeta.color}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-lg font-bold text-slate-800">
                      <span>{request.requester}</span>
                    </div>

                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {request.courseName && `${request.courseName} · `}
                      {request.purpose}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{request.borrowDate ? `${request.borrowDate} · ` : ""}{DAY_LABELS[request.day]} </span>
                      <span>Ca {SHIFT_LABELS[request.shift]}</span>
                      <span>Tiết {request.startPeriod}–{request.endPeriod}</span>
                      <span>{request.size} người</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600 min-w-[220px]">
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                      {request.status === "approved" ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : request.status === "rejected" ? (
                        <XCircle className="size-4 text-red-600" />
                      ) : (
                        <AlertCircle className="size-4 text-amber-600" />
                      )}
                      {statusMeta.detail}
                    </div>
                    {request.status === "approved" && request.roomId && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <DoorOpen className="size-3.5" />
                        Phòng được cấp: <strong className="text-slate-700">{request.roomId}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "violet" | "amber" | "emerald" | "red"
}) {
  const tones = {
    violet: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
  }

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex rounded-lg px-2 py-1 text-xs font-bold ${tones[tone]}`}>
        {label}
      </div>
      <div className="text-3xl font-bold tracking-tight text-slate-800">{value}</div>
    </div>
  )
}
