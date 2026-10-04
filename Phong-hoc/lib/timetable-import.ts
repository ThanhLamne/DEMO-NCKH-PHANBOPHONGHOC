import type { ClassInfo, Shift } from "./scheduling"

export type ImportedClass = Omit<ClassInfo, "id">
export type ImportIssue = { row: number; message: string; source: string }
export type TimetableParseResult = {
  classes: ImportedClass[]
  issues: ImportIssue[]
}
export type ImportProgress = (message: string, percent: number) => void

type ColumnName =
  | "name"
  | "className"
  | "courseCode"
  | "size"
  | "day"
  | "shift"
  | "period"
  | "periodCount"
  | "startPeriod"
  | "endPeriod"
  | "cohort"
  | "major"

const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_PDF_PAGES = 20

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim()
  }
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join(" ")
  if (typeof value === "object") {
    const cell = value as { text?: unknown; richText?: unknown; result?: unknown }
    if (typeof cell.text === "string") return cell.text.trim()
    if (Array.isArray(cell.richText)) return cellText(cell.richText)
    if (cell.result !== undefined) return cellText(cell.result)
  }
  return ""
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const delimiter = ["\t", ";", ","].sort(
    (left, right) =>
      firstLine.split(right).length - firstLine.split(left).length,
  )[0]
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(field.trim())
      field = ""
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function columnFor(header: string): ColumnName | null {
  const value = normalize(header)
  if (/^(ten mon|ten mon hoc|mon hoc|ten hoc phan|hoc phan|course name|subject)$/.test(value)) return "name"
  if (/^(lop|ten lop|ma lop|nhom|class|class name|section)$/.test(value)) return "className"
  if (/^(ma mon|ma hoc phan|course code|subject code)$/.test(value)) return "courseCode"
  if (/(si so|so sinh vien|so sv|quy mo|student count|students)/.test(value)) return "size"
  if (/^(thu|thu hoc|ngay hoc|weekday|day)$/.test(value)) return "day"
  if (/^(ca|ca hoc|buoi|shift)$/.test(value)) return "shift"
  if (/^(so tiet|number of periods|period count|duration)$/.test(value)) return "periodCount"
  if (/^(tiet|tiet hoc|period|periods)$/.test(value)) return "period"
  if (/^(tiet bat dau|tiet bd|start period|period start)$/.test(value)) return "startPeriod"
  if (/^(tiet ket thuc|tiet kt|end period|period end)$/.test(value)) return "endPeriod"
  if (/^(khoa|khoa hoc|cohort|year)$/.test(value)) return "cohort"
  if (/^(nganh|major|department)$/.test(value)) return "major"
  return null
}

function parseDay(value: string): number | null {
  const text = normalize(value)
  const match = text.match(/(?:thu|t)\s*([2-7])\b/) ?? text.match(/\b([2-7])\b/)
  if (match) return Number(match[1])
  const weekdays: Record<string, number> = {
    "thu hai": 2,
    "thu ba": 3,
    "thu tu": 4,
    "thu nam": 5,
    "thu sau": 6,
    "thu bay": 7,
    monday: 2,
    tuesday: 3,
    wednesday: 4,
    thursday: 5,
    friday: 6,
    saturday: 7,
  }
  return weekdays[text] ?? null
}

function parseShift(value: string): Shift | null {
  const text = normalize(value)
  if (/\b(sang|morning|am)\b/.test(text) || /^(ca )?1$/.test(text)) return "morning"
  if (/\b(chieu|afternoon|pm)\b/.test(text) || /^(ca )?2$/.test(text)) return "afternoon"
  if (/\b(toi|evening|night)\b/.test(text) || /^(ca )?3$/.test(text)) return "evening"
  return null
}

function periodRange(value: string): [number, number] | null {
  const numbers = value.match(/\d+/g)?.map(Number) ?? []
  if (numbers.length === 0) return null
  if (numbers.length > 1) return [numbers[0], numbers[1]]
  return [numbers[0], numbers[0]]
}

function periodCount(value: string): number | null {
  const match = normalize(value).match(/(\d+)\s*(?:tiet|period)/)
  if (match) return Number(match[1])
  const numbers = value.match(/\d+/g)?.map(Number) ?? []
  return numbers.length >= 2 ? Math.abs(numbers[1] - numbers[0]) + 1 : numbers[0] ?? null
}

function mapRow(
  row: string[],
  columns: Map<ColumnName, number>,
  rowNumber: number,
): { classInfo?: ImportedClass; issue?: ImportIssue } {
  const get = (column: ColumnName) => row[columns.get(column) ?? -1] ?? ""
  const name = get("name").trim() || get("className").trim()
  const day = parseDay(get("day"))
  const shift = parseShift(get("shift"))
  const size = Number(get("size").replace(/[^\d]/g, ""))
  const explicitStart = periodRange(get("startPeriod"))
  const explicitEnd = periodRange(get("endPeriod"))
  const period = periodRange(get("period"))
  const count = Number.parseInt(get("periodCount"), 10) || null
  const requestedPeriods = count ?? periodCount(get("period"))
  const hasPeriodDefinition = Boolean(requestedPeriods || explicitStart || explicitEnd || period)
  const raw = row.filter(Boolean).join(" | ")

  if (!name || day === null || !shift || !Number.isInteger(size) || size < 1 || !hasPeriodDefinition) {
    return {
      issue: {
        row: rowNumber,
        source: raw,
        message: "Thiếu tên môn/lớp, thứ, ca, sĩ số hoặc số tiết hợp lệ.",
      },
    }
  }

  const allowedPeriods: Record<Shift, [number, number]> = {
    morning: [1, 5],
    afternoon: [6, 10],
    evening: [11, 13],
  }
  const [minPeriod, maxPeriod] = allowedPeriods[shift]
  const normalizedStart =
    explicitStart?.[0] ??
    explicitEnd?.[0] ??
    period?.[0] ??
    minPeriod
  const normalizedEnd =
    explicitEnd?.[1] ??
    explicitStart?.[1] ??
    period?.[1] ??
    normalizedStart + (requestedPeriods ?? 1) - 1
  const periods = normalizedEnd - normalizedStart + 1
  if (
    normalizedStart < minPeriod ||
    normalizedEnd > maxPeriod ||
    normalizedEnd < normalizedStart
  ) {
    return {
      issue: {
        row: rowNumber,
        source: raw,
        message: "Tiết học không hợp lệ hoặc nằm ngoài ca đã chọn.",
      },
    }
  }

  const classInfo: ImportedClass = {
    name,
    size,
    day,
    shift,
    periods: normalizedEnd - normalizedStart + 1,
  }
  if (explicitStart || explicitEnd || period) {
    classInfo.startPeriod = normalizedStart
    classInfo.endPeriod = normalizedEnd
  }
  const className = get("className").trim()
  const courseCode = get("courseCode").trim()
  const cohort = get("cohort").trim().toUpperCase()
  const major = get("major").trim()
  if (className) classInfo.className = className
  if (courseCode) classInfo.courseCode = courseCode
  if (/^K2[3-6]$/.test(cohort)) classInfo.cohort = cohort as ImportedClass["cohort"]
  if (major) classInfo.major = major
  return { classInfo }
}

function looseRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s{2,}|\t|\|/).map((cell) => cell.trim()))
}

function parseLooseLine(line: string, rowNumber: number): { classInfo?: ImportedClass; issue?: ImportIssue } {
  const dayMatch =
    line.match(/\bthu\s*(?:[2-7]|hai|ba|tu|nam|sau|bay)\b/i) ??
    line.match(/\bt\s*([2-7])\b/i) ??
    line.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
  const shiftMatch = line.match(/\b(s[aá]ng|ch[ií]e[uù]|t[oó]i|morning|afternoon|evening)\b/i)
  const periodMatch =
    line.match(/(?:tiet|periods?)\s*(\d+)\s*(?:-|den|to)\s*(\d+)/i) ??
    line.match(/(?:tiet|periods?)\s*(\d+)/i)
  const sizeMatch = line.match(/(\d+)\s*(?:sv|sinh vien|students?)\b/i)

  if (!dayMatch || !shiftMatch || !periodMatch || !sizeMatch) {
    return {
      issue: {
        row: rowNumber,
        source: line,
        message: "Không nhận dạng đủ thứ, ca, tiết và sĩ số trong dòng này.",
      },
    }
  }

  let name = line
    .replace(dayMatch[0], " ")
    .replace(shiftMatch[0], " ")
    .replace(periodMatch[0], " ")
    .replace(sizeMatch[0], " ")
    .replace(/\b(?:lop|class)\s*[:#-]?\s*[\w.-]+\b/i, " ")
    .replace(/\b(?:K2[3-6]|[A-Z]{1,4}\d{2,})\b/g, " ")
    .replace(/[|,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const periodValues = periodMatch.slice(1).map(Number)
  const day = parseDay(dayMatch[0])
  const shift = parseShift(shiftMatch[0])
  const startPeriod = periodValues[0]
  const endPeriod = periodValues[1] ?? startPeriod
  if (!name || day === null || !shift) {
    return {
      issue: {
        row: rowNumber,
        source: line,
        message: "Không nhận dạng được tên môn, thứ hoặc ca học.",
      },
    }
  }

  const mapped = mapRow(
    [name, String(Number(sizeMatch[1])), String(day), shift, `${startPeriod}-${endPeriod}`],
    new Map([
      ["name", 0],
      ["size", 1],
      ["day", 2],
      ["shift", 3],
      ["period", 4],
    ]),
    rowNumber,
  )
  return mapped
}

export function parseTimetableRows(rows: string[][]): TimetableParseResult {
  const normalizedRows = rows
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean))
  const headerIndex = normalizedRows.findIndex(
    (row) => row.map(columnFor).filter(Boolean).length >= 3,
  )

  if (headerIndex < 0) {
    const classes: ImportedClass[] = []
    const issues: ImportIssue[] = []
    for (const [index, line] of rows.flat().entries()) {
      const result = parseLooseLine(line, index + 1)
      if (result.classInfo) classes.push(result.classInfo)
      else if (result.issue) issues.push(result.issue)
    }
    return { classes, issues }
  }

  const columns = new Map<ColumnName, number>()
  normalizedRows[headerIndex].forEach((header, index) => {
    const field = columnFor(header)
    if (field && !columns.has(field)) columns.set(field, index)
  })
  const classes: ImportedClass[] = []
  const issues: ImportIssue[] = []

  normalizedRows.slice(headerIndex + 1).forEach((row, index) => {
    const result = mapRow(row, columns, headerIndex + index + 2)
    if (result.classInfo) classes.push(result.classInfo)
    else if (result.issue) issues.push(result.issue)
  })
  return { classes, issues }
}

function textRowsToGrid(text: string): string[][] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []
  const headerIndex = lines.findIndex(
    (line) =>
      normalize(line).includes("thu") &&
      (normalize(line).includes("mon") || normalize(line).includes("hoc phan")),
  )
  if (headerIndex >= 0) {
    const header = lines[headerIndex].split(/\s{2,}|\t|\|/).filter(Boolean)
    if (header.map(columnFor).filter(Boolean).length >= 3) {
      return [
        header,
        ...lines
          .slice(headerIndex + 1)
          .map((line) => line.split(/\s{2,}|\t|\|/).map((cell) => cell.trim())),
      ]
    }
  }
  return lines.map((line) => [line])
}

function itemRows(items: Array<{ str?: string; transform?: number[] }>): string[][] {
  const positioned = items
    .filter((item) => item.str?.trim() && item.transform)
    .map((item) => ({
      text: item.str!.trim(),
      x: item.transform![4],
      y: item.transform![5],
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Array<Array<{ text: string; x: number; y: number }>> = []
  for (const item of positioned) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) < 4)
    if (row) row.push(item)
    else rows.push([item])
  }
  return rows.map((row) =>
    row
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text),
  )
}

async function recognizeImage(
  image: Blob | HTMLCanvasElement,
  progress: ImportProgress,
): Promise<string> {
  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker("vie+eng", 1, {
    workerPath: "/api/timetable-ocr/worker.min.js",
    corePath: "/api/timetable-ocr/",
    langPath: "/api/timetable-ocr",
    gzip: true,
    logger: (status) => {
      if (status.status === "recognizing text") {
        progress("Đang nhận dạng chữ trong ảnh...", Math.round(status.progress * 100))
      } else if (status.status === "loading language traineddata") {
        progress("Đang tải bộ nhận dạng tiếng Việt...", Math.round(status.progress * 100))
      }
    },
  })
  try {
    const result = await worker.recognize(image)
    return result.data.text
  } finally {
    await worker.terminate()
  }
}

async function pdfRows(
  file: File,
  progress: ImportProgress,
): Promise<string[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString()
  const document = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
  }).promise

  if (document.numPages > MAX_PDF_PAGES) {
    await document.destroy()
    throw new Error(`PDF có ${document.numPages} trang; giới hạn hiện tại là ${MAX_PDF_PAGES} trang.`)
  }

  const rows: string[][] = []
  let ocrText = ""
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      progress(`Đang đọc trang PDF ${pageNumber}/${document.numPages}...`, Math.round((pageNumber / document.numPages) * 70))
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const items = content.items.filter(
        (item): item is typeof item & { str: string; transform: number[] } =>
          "str" in item && "transform" in item,
      )
      const pageRows = itemRows(items)
      if (pageRows.some((row) => row.length > 1)) {
        rows.push(...pageRows)
        continue
      }

      const viewport = page.getViewport({ scale: 2 })
      const canvas = window.document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Trình duyệt không thể dựng trang PDF để nhận dạng.")
      await page.render({ canvasContext: context, canvas, viewport }).promise
      ocrText += `\n${await recognizeImage(canvas, progress)}`
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    await document.destroy()
  }

  return [...rows, ...textRowsToGrid(ocrText)]
}

export async function readTimetableFile(
  file: File,
  progress: ImportProgress,
): Promise<TimetableParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File vượt quá dung lượng tối đa 20 MB.")
  }

  const extension = file.name.split(".").at(-1)?.toLocaleLowerCase()
  progress("Đang mở tệp...", 0)
  let rows: string[][]

  if (extension === "csv") {
    rows = parseCsv(await file.text())
  } else if (extension === "xlsx" || extension === "xlsm") {
    const ExcelJS = await import("exceljs")
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    rows = []
    workbook.eachSheet((worksheet) => {
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : []
        rows.push(values.map(cellText))
      })
    })
  } else if (extension === "pdf") {
    rows = await pdfRows(file, progress)
  } else if (["png", "jpg", "jpeg", "webp", "bmp"].includes(extension ?? "")) {
    const text = await recognizeImage(file, progress)
    rows = textRowsToGrid(text)
  } else {
    throw new Error("Định dạng chưa hỗ trợ. Hãy chọn Excel (.xlsx/.xlsm), CSV, PDF hoặc ảnh PNG/JPG/WEBP/BMP.")
  }

  progress("Đang phân tích các dòng thời khóa biểu...", 100)
  const parsed = parseTimetableRows(rows)
  if (parsed.classes.length === 0 && parsed.issues.length === 0) {
    throw new Error("Không tìm thấy dữ liệu trong tệp.")
  }
  return parsed
}
