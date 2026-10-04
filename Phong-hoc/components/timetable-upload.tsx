"use client"

import { useRef, useState } from "react"
import { FileUp, LoaderCircle, Trash2, Upload, X } from "lucide-react"
import { DAY_LABELS, SHIFT_LABELS } from "@/lib/scheduling"
import type { ImportedClass, ImportIssue } from "@/lib/timetable-import"

type ImportSummary = { added: number; duplicates: string[] }

export function TimetableUpload({
  onImport,
}: {
  onImport: (classes: ImportedClass[]) => ImportSummary
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [classes, setClasses] = useState<ImportedClass[]>([])
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [error, setError] = useState("")
  const [progress, setProgress] = useState<{ message: string; percent: number } | null>(null)
  const [notice, setNotice] = useState("")

  async function handleFile(file?: File) {
    if (!file) return
    setFileName(file.name)
    setClasses([])
    setIssues([])
    setError("")
    setNotice("")
    setProgress({ message: "Đang chuẩn bị đọc tệp...", percent: 0 })

    try {
      const { readTimetableFile } = await import("@/lib/timetable-import")
      const result = await readTimetableFile(file, (message, percent) =>
        setProgress({ message, percent }),
      )
      setClasses(result.classes)
      setIssues(result.issues)
      if (result.classes.length === 0) {
        setError(
          "Chưa đọc được dòng thời khóa biểu hợp lệ. Hãy kiểm tra định dạng bảng hoặc nhập theo hướng dẫn cột bên dưới.",
        )
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể đọc tệp thời khóa biểu.",
      )
    } finally {
      setProgress(null)
    }
  }

  function importClasses() {
    const summary = onImport(classes)
    const importedNames = new Set(summary.duplicates)
    setClasses((current) =>
      current.filter((classInfo) => !importedNames.has(classInfo.name)),
    )
    if (summary.duplicates.length > 0) {
      setIssues((current) => [
        ...current,
        ...summary.duplicates.map((name) => ({
          row: 0,
          source: name,
          message: "Bỏ qua vì lớp này đã có trong thời khóa biểu.",
        })),
      ])
    }
    setNotice(
      summary.added > 0
        ? `Đã thêm ${summary.added} lớp vào thời khóa biểu. Lớp mới được giữ ở trạng thái chờ xếp nếu lịch đã chốt.`
        : "Không có lớp mới được thêm; các lớp đọc được đều đã tồn tại.",
    )
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <FileUp className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Tải thời khóa biểu lên
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              Đọc Excel, CSV, PDF có chữ hoặc PDF/ảnh scan bằng OCR tiếng Việt.
              Tệp được xử lý tại trình duyệt của bạn; hãy rà soát bản xem trước
              trước khi thêm vào lịch.
            </p>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              Nên có tiêu đề cột: Tên môn học, Mã lớp (không bắt buộc), Sĩ số,
              Thứ, Ca, Tiết hoặc Tiết bắt đầu/Tiết kết thúc. Ảnh/PDF scan cần
              rõ nét; OCR có thể cần kiểm tra lại.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.pdf,.png,.jpg,.jpeg,.webp,.bmp"
            className="sr-only"
            aria-label="Chọn tệp thời khóa biểu"
            onChange={(event) => {
              void handleFile(event.target.files?.[0])
              event.currentTarget.value = ""
            }}
          />
          <button
            type="button"
            disabled={Boolean(progress)}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60"
          >
            {progress ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Chọn tệp
          </button>
          {fileName && (
            <span className="max-w-48 truncate text-xs font-medium text-slate-600">
              {fileName}
            </span>
          )}
        </div>
      </div>

      {progress && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>{progress.message}</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-[width]"
              style={{ width: `${Math.max(4, progress.percent)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {classes.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-900">
                Bản xem trước: {classes.length} lớp đọc được
              </h3>
              <p className="text-xs text-slate-600">
                Kiểm tra tên lớp, sĩ số, thứ, ca và tiết trước khi nhập.
              </p>
            </div>
            <button
              type="button"
              onClick={importClasses}
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
            >
              Thêm {classes.length} lớp vào TKB
            </button>
          </div>

          <div className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2.5">Môn / học phần</th>
                  <th className="px-3 py-2.5">Mã / lớp</th>
                  <th className="px-3 py-2.5">Sĩ số</th>
                  <th className="px-3 py-2.5">Thời gian</th>
                  <th className="px-3 py-2.5">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((classInfo, index) => (
                  <tr key={`${classInfo.name}-${index}`} className="text-slate-700">
                    <td className="px-3 py-2.5 font-semibold">{classInfo.name}</td>
                    <td className="px-3 py-2.5">
                      {[classInfo.courseCode, classInfo.className, classInfo.cohort]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">{classInfo.size}</td>
                    <td className="px-3 py-2.5">
                      {DAY_LABELS[classInfo.day]} · {SHIFT_LABELS[classInfo.shift]} ·
                      {" "}tiết {classInfo.startPeriod}–{classInfo.endPeriod}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        aria-label={`Bỏ lớp ${classInfo.name} khỏi bản xem trước`}
                        onClick={() =>
                          setClasses((current) =>
                            current.filter((_, currentIndex) => currentIndex !== index),
                          )
                        }
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-amber-900">
            Cần kiểm tra {issues.length} dòng chưa nhập
          </summary>
          <ul className="mt-3 max-h-48 space-y-2 overflow-auto">
            {issues.map((issue, index) => (
              <li key={`${issue.row}-${index}`} className="text-xs leading-5 text-amber-900">
                <strong>{issue.row > 0 ? `Dòng ${issue.row}: ` : ""}</strong>
                {issue.message}
                {issue.source && <span className="block break-words text-amber-800">{issue.source}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(classes.length > 0 || issues.length > 0) && (
        <button
          type="button"
          onClick={() => {
            setFileName("")
            setClasses([])
            setIssues([])
            setError("")
            setNotice("")
            if (inputRef.current) inputRef.current.value = ""
          }}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <X className="size-3.5" />
          Xóa bản xem trước
        </button>
      )}
    </section>
  )
}
