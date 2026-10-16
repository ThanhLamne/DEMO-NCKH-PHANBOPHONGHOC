"use client"

import { useMemo, useState } from "react"
import { CalendarDays, CheckCircle2, ClipboardPenLine, Clock3, Send, UserRound } from "lucide-react"
import { addBorrowRequest, getSchedulingDay, getWeekKey } from "@/lib/borrow-store"
import { DAY_LABELS, SHIFT_LABELS, SHIFT_PERIODS, SHIFTS, type Shift } from "@/lib/scheduling"

const today = new Date()
const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

export function BorrowRequestForm({ requesterType }: { requesterType: "Giảng viên" | "Sinh viên" }) {
  const [requester, setRequester] = useState("")
  const [courseName, setCourseName] = useState("")
  const [className, setClassName] = useState("")
  const [purpose, setPurpose] = useState("")
  const [borrowDate, setBorrowDate] = useState(todayValue)
  const [shift, setShift] = useState<Shift>("afternoon")
  const [startPeriod, setStartPeriod] = useState(6)
  const [endPeriod, setEndPeriod] = useState(8)
  const [size, setSize] = useState("30")
  const [submitted, setSubmitted] = useState(false)

  const periods = useMemo(() => SHIFT_PERIODS[shift], [shift])
  const selectedDay = getSchedulingDay(new Date(`${borrowDate}T12:00:00`))

  function handleShiftChange(nextShift: Shift) {
    setShift(nextShift)
    const nextPeriods = SHIFT_PERIODS[nextShift]
    setStartPeriod(nextPeriods[0])
    setEndPeriod(nextPeriods[Math.min(2, nextPeriods.length - 1)])
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requester.trim() || !courseName.trim() || !borrowDate || endPeriod < startPeriod) return

    addBorrowRequest({
      requester: requester.trim(),
      requesterType,
      courseName: courseName.trim(),
      className: className.trim(),
      borrowDate,
      purpose: purpose.trim() || `Mượn phòng cho môn ${courseName.trim()}`,
      day: selectedDay,
      shift,
      startPeriod,
      endPeriod,
      size: Math.max(1, Number(size) || 1),
      weekKey: getWeekKey(new Date(`${borrowDate}T12:00:00`)),
    })
    setSubmitted(true)
    setPurpose("")
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm">
              <ClipboardPenLine className="size-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">Đăng ký mượn phòng</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Điền thông tin lớp và thời gian cần mượn. Yêu cầu sẽ được gửi đến admin để kiểm tra và phê duyệt.
            </p>
          </div>
          <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-sky-700">
            {requesterType}
          </span>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
          <UserRound className="size-5 text-sky-600" />
          <div>
            <h3 className="font-bold text-slate-800">Thông tin phiếu mượn</h3>
            <p className="text-xs text-slate-500">Các trường có dấu * là bắt buộc.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Họ tên người đăng ký *">
            <input required value={requester} onChange={(event) => setRequester(event.target.value)} className={inputClass} placeholder="Nhập họ và tên" />
          </Field>
          <Field label="Môn học / hoạt động *">
            <input required value={courseName} onChange={(event) => setCourseName(event.target.value)} className={inputClass} placeholder="Ví dụ: Quản lý hành chính" />
          </Field>
          <Field label="Tên lớp / nhóm">
            <input value={className} onChange={(event) => setClassName(event.target.value)} className={inputClass} placeholder="Ví dụ: K25A1 hoặc Nhóm nghiên cứu" />
          </Field>
          <Field label="Số người">
            <input type="number" min="1" value={size} onChange={(event) => setSize(event.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="mt-6 flex items-center gap-3 border-b border-slate-100 pb-4">
          <CalendarDays className="size-5 text-sky-600" />
          <div>
            <h3 className="font-bold text-slate-800">Thời gian mượn</h3>
            <p className="text-xs text-slate-500">Lịch được áp dụng cho tuần chứa ngày bạn chọn.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Ngày mượn *">
            <input required type="date" value={borrowDate} onChange={(event) => setBorrowDate(event.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs text-slate-500">{DAY_LABELS[selectedDay] ?? "Ngày đã chọn"}</span>
          </Field>
          <Field label="Ca học *">
            <select value={shift} onChange={(event) => handleShiftChange(event.target.value as Shift)} className={inputClass}>
              {SHIFTS.map((item) => <option key={item} value={item}>{SHIFT_LABELS[item]}</option>)}
            </select>
          </Field>
          <Field label="Tiết bắt đầu *">
            <select value={startPeriod} onChange={(event) => setStartPeriod(Number(event.target.value))} className={inputClass}>
              {periods.map((period) => <option key={period} value={period}>Tiết {period}</option>)}
            </select>
          </Field>
          <Field label="Tiết kết thúc *">
            <select value={endPeriod} onChange={(event) => setEndPeriod(Number(event.target.value))} className={inputClass}>
              {periods.filter((period) => period >= startPeriod).map((period) => <option key={period} value={period}>Tiết {period}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Mục đích / ghi chú">
          <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Nhập mục đích mượn phòng hoặc thông tin cần admin lưu ý" />
        </Field>

        {submitted && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold">Đã gửi yêu cầu thành công.</p>
              <p className="mt-1">Admin sẽ nhận được phiếu và phản hồi sau khi kiểm tra lịch phòng.</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="size-4" />{DAY_LABELS[selectedDay]} · Ca {SHIFT_LABELS[shift]} · Tiết {startPeriod}–{endPeriod}</p>
          <button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700">
            <Send className="size-4" /> Gửi phiếu mượn
          </button>
        </div>
      </form>
    </div>
  )
}

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mb-4 block text-sm font-semibold text-slate-700">{label}{children}</label>
}
