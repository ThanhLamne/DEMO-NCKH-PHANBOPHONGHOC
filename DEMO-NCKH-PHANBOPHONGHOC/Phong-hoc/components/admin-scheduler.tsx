"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Wand2,
  Plus,
  Users,
  CalendarDays,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  PlusCircle,
  Trash2,
  RotateCcw,
  Pencil,
  X,
  Sun,
  CloudSun,
  Moon,
  Building2,
  Search,
} from "lucide-react";
import {
  type ClassInfo,
  type ScheduleResult,
  type Shift,
  type AltSlot,
  type CampusFilter,
  type CohortFilter,
  DAYS,
  DAY_LABELS,
  DAY_SHORT,
  SHIFTS,
  SHIFT_LABELS,
  SHIFT_PERIODS,
  createClassId,
  autoSchedule,
  findAlternatives,
  rangeTime,
  CAMPUS_LABELS,
  COHORT_LABELS,
  removeClassFromSchedule,
  schedulePendingClasses,
} from "@/lib/scheduling";
import { SHEET_CLASSES, SHEET_ROOMS } from "@/lib/schedule-data";
import { TimetableUpload } from "@/components/timetable-upload";
import type { ImportedClass } from "@/lib/timetable-import";
import {
  getCourseCredits,
  getCourseMeetingTimelines,
} from "@/lib/course-timing";
import {
  clearAllocationSnapshot,
  clearImportedClasses,
  loadImportedClasses,
  loadAllocationSnapshot,
  saveImportedClasses,
  saveAllocationSnapshot,
} from "@/lib/allocation-store";
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  isBorrowRequestActiveAt,
  loadBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store";

const ROOMS = SHEET_ROOMS;

type ImportPreviewRow = {
  rowNumber: number;
  values: Record<string, string | number>;
  classInfo?: Omit<ClassInfo, "id">;
  errors: string[];
};

type ImportState = {
  fileName: string;
  rows: ImportPreviewRow[];
  classes: ClassInfo[];
  errors: string[];
};

const IMPORT_COLUMNS = {
  name: ["tenmon", "monhoc", "tenlop", "hocphan", "subject", "name"],
  size: ["siso", "soluong", "soluongsinhvien", "size", "capacity"],
  day: ["thu", "ngayhoc", "day"],
  shift: ["ca", "cahoc", "shift"],
  periods: ["sotiet", "sotiet hoc", "periods", "duration"],
  startPeriod: ["tietbatdau", "tietbd", "startperiod"],
  endPeriod: ["tietketthuc", "tietkt", "endperiod"],
  cohort: ["khoa", "khoahoc", "cohort"],
  courseCode: ["mamon", "magv", "coursecode", "code"],
  major: ["nganh", "major"],
  className: ["malop", "tenlop", "classname", "class"],
  section: ["nhom", "section"],
} as const;

function normalizeImportHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function importValue(
  row: Record<string, unknown>,
  aliases: readonly string[],
): unknown {
  const key = Object.keys(row).find((item) =>
    aliases.includes(normalizeImportHeader(item)),
  );
  return key ? row[key] : undefined;
}

function numericImportValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseImportedRows(rows: Record<string, unknown>[]): {
  previews: ImportPreviewRow[];
  classes: ClassInfo[];
  errors: string[];
} {
  const previews: ImportPreviewRow[] = [];
  const classes: ClassInfo[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();
  const validShifts = new Set<Shift>(SHIFTS);
  const shiftAliases: Record<string, Shift> = {
    sang: "morning",
    morning: "morning",
    chieu: "afternoon",
    afternoon: "afternoon",
    toi: "evening",
    evening: "evening",
  };

  rows.forEach((row, index) => {
    const rowErrors: string[] = [];
    const name = String(importValue(row, IMPORT_COLUMNS.name) ?? "").trim();
    const size = numericImportValue(importValue(row, IMPORT_COLUMNS.size));
    const day = numericImportValue(importValue(row, IMPORT_COLUMNS.day));
    const periods = numericImportValue(
      importValue(row, IMPORT_COLUMNS.periods),
    );
    const rawShift = normalizeImportHeader(
      importValue(row, IMPORT_COLUMNS.shift),
    );
    const shift = shiftAliases[rawShift];
    const startPeriod = numericImportValue(
      importValue(row, IMPORT_COLUMNS.startPeriod),
    );
    const endPeriod = numericImportValue(
      importValue(row, IMPORT_COLUMNS.endPeriod),
    );
    const normalizedName = name.toLocaleLowerCase();

    if (!name) rowErrors.push("Thiếu tên môn/lớp");
    if (size === null || size <= 0 || !Number.isInteger(size))
      rowErrors.push("Sĩ số phải là số nguyên dương");
    if (day === null || !DAYS.includes(day as (typeof DAYS)[number]))
      rowErrors.push("Thứ phải từ 2 đến 7");
    if (!shift || !validShifts.has(shift))
      rowErrors.push("Ca học không hợp lệ (Sáng/Chiều/Tối)");
    if (
      periods === null ||
      periods < 1 ||
      !Number.isInteger(periods) ||
      periods > SHIFT_PERIODS[shift ?? "morning"].length
    )
      rowErrors.push("Số tiết không hợp lệ");
    if (
      (startPeriod !== null && (startPeriod < 1 || startPeriod > 13)) ||
      (endPeriod !== null && (endPeriod < 1 || endPeriod > 13)) ||
      (startPeriod !== null &&
        endPeriod !== null &&
        endPeriod - startPeriod + 1 !== periods)
    )
      rowErrors.push("Khoảng tiết bắt đầu/kết thúc không hợp lệ");
    if (seenNames.has(normalizedName)) rowErrors.push("Trùng môn/lớp trong file");
    if (name) seenNames.add(normalizedName);

    const classInfo =
      rowErrors.length === 0
        ? {
            name,
            size: size!,
            day: day!,
            shift: shift!,
            periods: periods!,
            ...(startPeriod !== null ? { startPeriod } : {}),
            ...(endPeriod !== null ? { endPeriod } : {}),
            ...(String(importValue(row, IMPORT_COLUMNS.cohort) ?? "").trim()
              ? {
                  cohort: String(
                    importValue(row, IMPORT_COLUMNS.cohort),
                  ).trim() as ClassInfo["cohort"],
                }
              : {}),
            ...(String(importValue(row, IMPORT_COLUMNS.courseCode) ?? "").trim()
              ? {
                  courseCode: String(
                    importValue(row, IMPORT_COLUMNS.courseCode),
                  ).trim(),
                }
              : {}),
            ...(String(importValue(row, IMPORT_COLUMNS.major) ?? "").trim()
              ? { major: String(importValue(row, IMPORT_COLUMNS.major)).trim() }
              : {}),
            ...(String(importValue(row, IMPORT_COLUMNS.className) ?? "").trim()
              ? {
                  className: String(
                    importValue(row, IMPORT_COLUMNS.className),
                  ).trim(),
                }
              : {}),
            ...(String(importValue(row, IMPORT_COLUMNS.section) ?? "").trim()
              ? {
                  section: String(
                    importValue(row, IMPORT_COLUMNS.section),
                  ).trim(),
                }
              : {}),
          }
        : undefined;
    const preview: ImportPreviewRow = {
      rowNumber: index + 2,
      values: Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, String(value ?? "")]),
      ),
      classInfo,
      errors: rowErrors,
    };
    previews.push(preview);
    if (classInfo) classes.push({ ...classInfo, id: `import-${index + 1}` });
    if (rowErrors.length) errors.push(`Dòng ${index + 2}: ${rowErrors.join(", ")}`);
  });

  return { previews, classes, errors };
}

const SHIFT_ICON: Record<Shift, React.ReactNode> = {
  morning: <Sun className="size-4" />,
  afternoon: <CloudSun className="size-4" />,
  evening: <Moon className="size-4" />,
};

const SHIFT_TONE: Record<Shift, string> = {
  morning: "border-amber-200 bg-amber-50/70 text-amber-700",
  afternoon: "border-sky-200 bg-sky-50/70 text-sky-700",
  evening: "border-indigo-200 bg-indigo-50/70 text-indigo-700",
};

function capacityTone(capacity: number): string {
  if (capacity >= 100) return "bg-primary/10 text-primary";
  if (capacity >= 60) return "bg-sky-500/10 text-sky-700";
  return "bg-emerald-500/10 text-emerald-700";
}

function formatCourseEnd(courseEndAt?: string): string | null {
  if (!courseEndAt) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${courseEndAt}:00Z`));
}

function getCourseCode(classInfo: ClassInfo): string | undefined {
  const code = classInfo.courseCode?.replace(/\s+/g, "");
  return code && /^[A-Z0-9-]+$/.test(code) && /\d/.test(code)
    ? code
    : undefined;
}

function normalizeSearchText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function buildingOrder(building?: string): string {
  if (!building) return "ZZZ";
  if (building === "HoiTruong") return "ZZZ";
  if (building.includes("-")) return building.split("-").at(-1) ?? building;
  return building;
}

const CAMPUS_SCHEDULE_GROUPS = [
  {
    campus: "36 Xuân La" as const,
    label: "Cơ sở 36 Xuân La",
    tone: "border-sky-200 bg-sky-50/70 text-sky-800",
  },
  {
    campus: "371 Nguyễn Hoàng Tôn" as const,
    label: "Cơ sở 371 Nguyễn Hoàng Tôn",
    tone: "border-violet-200 bg-violet-50/70 text-violet-800",
  },
  {
    campus: "77 NCT" as const,
    label: "Cơ sở 3 - 77 NCT",
    tone: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
  },
];

export function AdminScheduler() {
  const [classes, setClasses] = useState<ClassInfo[]>(SHEET_CLASSES);
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(2);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [newClassIds, setNewClassIds] = useState<string[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<CampusFilter>("all");
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all");
  const [selectedCohort, setSelectedCohort] = useState<CohortFilter>("all");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [highlightedClassId, setHighlightedClassId] = useState<string | null>(
    null,
  );
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    function clearHighlight(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-assignment-card]"))
        return;
      setHighlightedClassId(null);
    }
    document.addEventListener("mousedown", clearHighlight);
    return () => document.removeEventListener("mousedown", clearHighlight);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const refreshBorrowRequests = () => setBorrowRequests(loadBorrowRequests());
    refreshBorrowRequests();
    window.addEventListener(
      BORROW_REQUESTS_UPDATED_EVENT,
      refreshBorrowRequests,
    );
    window.addEventListener("storage", refreshBorrowRequests);
    return () => {
      window.removeEventListener(
        BORROW_REQUESTS_UPDATED_EVENT,
        refreshBorrowRequests,
      );
      window.removeEventListener("storage", refreshBorrowRequests);
    };
  }, []);

  useEffect(() => {
    const importedClasses = loadImportedClasses();
    if (importedClasses) setClasses(importedClasses);
    const snapshot = loadAllocationSnapshot();
    if (!snapshot) return;
    setClasses(snapshot.classes);
    setResult(snapshot.result);
    setNewClassIds(
      snapshot.classes
        .filter((item) => !SHEET_CLASSES.some((base) => base.id === item.id))
        .map((item) => item.id),
    );
  }, []);

  useEffect(() => {
    if (result) saveAllocationSnapshot({ classes, result });
  }, [classes, result]);

  const roomById = useMemo(() => {
    const map = new Map(ROOMS.map((r) => [r.id, r]));
    return map;
  }, []);
  const courseTimelines = useMemo(
    () => getCourseMeetingTimelines(classes),
    [classes],
  );

  const approvedBorrowRequests = useMemo(
    () =>
      borrowRequests.filter(
        (request) => isBorrowRequestActiveAt(request, now),
      ),
    [borrowRequests, now],
  );

  const borrowedClasses = useMemo<ClassInfo[]>(
    () =>
      approvedBorrowRequests.map(
        (request): ClassInfo => ({
          id: `borrow-${request.id}`,
          name: `Mượn phòng: ${request.courseName ?? request.purpose}`,
          size: request.size,
          day: request.day,
          shift: request.shift,
          periods: request.endPeriod - request.startPeriod + 1,
          startPeriod: request.startPeriod,
          endPeriod: request.endPeriod,
          className: `${request.className ? `${request.className} · ` : ""}${request.requester} · ${request.requesterType} · ${request.purpose}`,
        }),
      ),
    [approvedBorrowRequests],
  );

  const borrowedAssignments = useMemo(
    () =>
      approvedBorrowRequests.map((request) => ({
        classId: `borrow-${request.id}`,
        roomId: request.roomId!,
        day: request.day,
        shift: request.shift,
        startPeriod: request.startPeriod,
        endPeriod: request.endPeriod,
      })),
    [approvedBorrowRequests],
  );

  const displayAssignments = useMemo(
    () => (result ? [...result.assignments, ...borrowedAssignments] : []),
    [result, borrowedAssignments],
  );

  const classById = useMemo(
    () => new Map([...classes, ...borrowedClasses].map((c) => [c.id, c])),
    [classes, borrowedClasses],
  );

  function handleSchedule() {
    setResult((current) =>
      current
        ? schedulePendingClasses(classes, ROOMS, current)
        : autoSchedule(classes, ROOMS),
    );
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      setImportState({
        fileName: file.name,
        rows: [],
        classes: [],
        errors: ["Chỉ hỗ trợ file Excel định dạng .xlsx"],
      });
      return;
    }
    setIsImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!firstSheet) throw new Error("File không có trang tính nào.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        firstSheet,
        { defval: "" },
      );
      if (!rows.length) throw new Error("Trang tính không có dữ liệu.");
      const parsed = parseImportedRows(rows);
      setImportState({
        fileName: file.name,
        rows: parsed.previews,
        classes: parsed.classes,
        errors: parsed.errors,
      });
    } catch (error) {
      setImportState({
        fileName: file.name,
        rows: [],
        classes: [],
        errors: [
          error instanceof Error
            ? `Không thể đọc file: ${error.message}`
            : "Không thể đọc file Excel.",
        ],
      });
    } finally {
      setIsImporting(false);
    }
  }

  function handleConfirmImport() {
    if (!importState || importState.errors.length || !importState.classes.length)
      return;
    saveImportedClasses(importState.classes);
    clearAllocationSnapshot();
    setClasses(importState.classes);
    setResult(null);
    setNewClassIds(importState.classes.map((item) => item.id));
    setImportState(null);
  }

  function handleAddClass(cls: Omit<ClassInfo, "id">): string | null {
    const normalizedName = cls.name.trim().toLocaleLowerCase();
    if (
      classes.some(
        (item) => item.name.trim().toLocaleLowerCase() === normalizedName,
      )
    ) {
      return `Môn "${cls.name.trim()}" đã có trong danh sách lớp. Vui lòng nhập môn khác.`;
    }

    let newClassId = createClassId();
    while (classes.some((item) => item.id === newClassId)) {
      newClassId = createClassId();
    }
    const newClass = { ...cls, id: newClassId };
    const nextClasses = [...classes, newClass];
    setClasses(nextClasses);
    setResult((current) =>
      current
        ? {
            ...current,
            unassigned: [
              ...current.unassigned.filter(
                (item) => item.classInfo.id !== newClass.id,
              ),
              {
                classInfo: newClass,
                reason:
                  "Lớp mới đang chờ xếp. Bấm “Sắp xếp tự động” để tìm phòng và tiết còn trống; các lịch đã xếp sẽ được giữ nguyên.",
              },
            ],
          }
        : autoSchedule(nextClasses, ROOMS),
    );
    setNewClassIds((prev) => [...prev, newClass.id]);
    return null;
  }

  function handleImportClasses(importedClasses: ImportedClass[]) {
    const existingNames = new Set(
      classes.map((item) => item.name.trim().toLocaleLowerCase()),
    );
    const accepted: ClassInfo[] = [];
    const duplicates: string[] = [];

    for (const importedClass of importedClasses) {
      const normalizedName = importedClass.name.trim().toLocaleLowerCase();
      if (existingNames.has(normalizedName)) {
        duplicates.push(importedClass.name);
        continue;
      }

      existingNames.add(normalizedName);
      let id = createClassId();
      while (
        classes.some((item) => item.id === id) ||
        accepted.some((item) => item.id === id)
      ) {
        id = createClassId();
      }
      accepted.push({ ...importedClass, id });
    }

    if (accepted.length === 0) return { added: 0, duplicates };

    const nextClasses = [...classes, ...accepted];
    setClasses(nextClasses);
    setNewClassIds((current) => [
      ...current,
      ...accepted.map((classInfo) => classInfo.id),
    ]);
    setResult((current) =>
      current
        ? {
            ...current,
            unassigned: [
              ...current.unassigned,
              ...accepted.map((classInfo) => ({
                classInfo,
                reason:
                  classInfo.size < 1 || classInfo.needsReview?.length
                    ? `Chưa thể xếp phòng cho lớp này: cần bổ sung ${classInfo.needsReview?.join(", ") || "sĩ số"} trước.`
                    : "Lớp mới nhập đang chờ xếp. Bấm “Sắp xếp tự động” để tìm phòng và tiết còn trống.",
              })),
            ],
          }
        : autoSchedule(nextClasses, ROOMS),
    );

    return { added: accepted.length, duplicates };
  }

  function handleRemoveClass(id: string) {
    setClasses((prev) => prev.filter((c) => c.id !== id));
    setResult((prev) =>
      prev ? removeClassFromSchedule(id, ROOMS, prev) : prev,
    );
    setEditingClassId(null);
    setNewClassIds((prev) => prev.filter((classId) => classId !== id));
  }

  function handleResetData() {
    setClasses(SHEET_CLASSES);
    setResult(null);
    clearAllocationSnapshot();
    clearImportedClasses();
    setEditingClassId(null);
    setNewClassIds([]);
  }

  // Xếp thủ công 1 lớp bị đẩy ra ngoài vào phòng đủ điều kiện đã chọn.
  function handlePlaceClass(cls: ClassInfo, alt: AltSlot) {
    if (cls.size < 1 || cls.needsReview?.length) return;

    const updatedAssignment = {
      classId: cls.id,
      roomId: alt.roomId,
      day: alt.day,
      shift: alt.shift,
      startPeriod: alt.startPeriod,
      endPeriod: alt.endPeriod,
    };
    setClasses((prev) =>
      prev.map((c) =>
        c.id === cls.id ? { ...c, day: alt.day, shift: alt.shift } : c,
      ),
    );
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: [...prev.assignments, updatedAssignment],
        unassigned: prev.unassigned.filter((u) => u.classInfo.id !== cls.id),
      };
    });
    const room = roomById.get(alt.roomId);
    setSelectedDay(alt.day);
    setSelectedCampus(room?.campus ?? "all");
    setSelectedBuilding(room?.building ?? "all");
    setSelectedCohort(cls.cohort ?? "all");
    setEditingClassId(null);
    setHighlightedClassId(cls.id);
    window.setTimeout(() => {
      document
        .getElementById(`assignment-${cls.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function handleMoveClass(classId: string, alt: AltSlot) {
    setClasses((prev) =>
      prev.map((c) =>
        c.id === classId ? { ...c, day: alt.day, shift: alt.shift } : c,
      ),
    );
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map((assignment) =>
          assignment.classId === classId
            ? {
                ...assignment,
                roomId: alt.roomId,
                day: alt.day,
                shift: alt.shift,
                startPeriod: alt.startPeriod,
                endPeriod: alt.endPeriod,
              }
            : assignment,
        ),
        unassigned: prev.unassigned,
      };
    });
    setSelectedDay(alt.day);
    setEditingClassId(null);
    setHighlightedClassId(classId);
  }

  function showAssignment(assignment: import("@/lib/scheduling").Assignment) {
    const cls = classById.get(assignment.classId);
    const room = roomById.get(assignment.roomId);
    if (!cls || !room) return;
    setSelectedDay(assignment.day);
    setSelectedCampus(room.campus ?? "all");
    setSelectedBuilding(room.building ?? "all");
    setSelectedCohort(cls.cohort ?? "all");
    setHighlightedClassId(assignment.classId);
    window.setTimeout(() => {
      document
        .getElementById(`assignment-${assignment.classId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  const dayAssignments = useMemo(() => {
    if (!result) return [];
    return displayAssignments.filter(
      (assignment) =>
        assignment.day === selectedDay &&
        (selectedCohort === "all" ||
          classById.get(assignment.classId)?.cohort === selectedCohort) &&
        (selectedCampus === "all" ||
          roomById.get(assignment.roomId)?.campus === selectedCampus) &&
        (selectedBuilding === "all" ||
          roomById.get(assignment.roomId)?.building === selectedBuilding),
    );
  }, [
    displayAssignments,
    selectedDay,
    selectedCohort,
    selectedCampus,
    selectedBuilding,
    roomById,
    classById,
  ]);

  const searchResults = useMemo(() => {
    const query = normalizeSearchText(scheduleSearch).trim();
    if (!result || !query) return [];
    const queryTerms = query.split(/\s+/).filter(Boolean);

    return displayAssignments
      .filter((assignment) => {
        const cls = classById.get(assignment.classId);
        const room = roomById.get(assignment.roomId);
        if (!cls || !room) return false;
        if (selectedCohort !== "all" && cls.cohort !== selectedCohort)
          return false;
        if (selectedCampus !== "all" && room.campus !== selectedCampus)
          return false;
        if (selectedBuilding !== "all" && room.building !== selectedBuilding)
          return false;
        const searchableText = [
          cls.name,
          cls.className,
          cls.courseCode,
          cls.cohort,
          cls.section,
          cls.major,
          cls.id,
          room.name,
          room.building,
          room.campus,
        ]
          .filter(Boolean)
          .map((value) => normalizeSearchText(value))
          .join(" ");
        return queryTerms.every((term) => searchableText.includes(term));
      })
      .sort((a, b) => a.day - b.day || a.startPeriod - b.startPeriod);
  }, [
    displayAssignments,
    scheduleSearch,
    selectedCohort,
    selectedCampus,
    selectedBuilding,
    roomById,
    classById,
  ]);

  const buildingGroups = useMemo(
    () =>
      [
        { campus: "36 Xuân La" as const, label: "Cơ sở 36 Xuân La" },
        {
          campus: "371 Nguyễn Hoàng Tôn" as const,
          label: "Cơ sở 371 Nguyễn Hoàng Tôn",
        },
        { campus: "77 NCT" as const, label: "Cơ sở 3 - 77 NCT" },
      ].map((group) => ({
        ...group,
        buildings: [
          ...new Set(
            ROOMS.filter((room) => room.campus === group.campus)
              .map((room) => room.building)
              .filter((value): value is string => Boolean(value)),
          ),
        ].sort((a, b) =>
          buildingOrder(a).localeCompare(buildingOrder(b), "vi"),
        ),
      })),
    [],
  );

  const assignedCountByDay = useMemo(() => {
    const map = new Map<number, number>();
    if (result) {
      for (const assignment of displayAssignments) {
        const room = roomById.get(assignment.roomId);
        const cls = classById.get(assignment.classId);
        if (
          (selectedCohort === "all" || cls?.cohort === selectedCohort) &&
          (selectedCampus === "all" || room?.campus === selectedCampus) &&
          (selectedBuilding === "all" || room?.building === selectedBuilding)
        ) {
          map.set(assignment.day, (map.get(assignment.day) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [
    displayAssignments,
    selectedCohort,
    selectedCampus,
    selectedBuilding,
    roomById,
    classById,
  ]);

  return (
    <div className="space-y-6">
      <TimetableUpload onImport={handleImportClasses} />
      <AddClassForm onAdd={handleAddClass} />

      <section
        aria-label="Chọn khóa xem lịch phòng"
        className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <CalendarDays className="size-4 text-primary" />
          Lịch phòng theo khóa
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Chọn một khóa để chỉ xem các phòng đã được phân bổ cho khóa đó.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(COHORT_LABELS) as CohortFilter[]).map((cohort) => (
            <button
              key={cohort}
              type="button"
              onClick={() => setSelectedCohort(cohort)}
              className={[
                "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all",
                selectedCohort === cohort
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
              ].join(" ")}
            >
              {COHORT_LABELS[cohort]}
            </button>
          ))}
        </div>
        {selectedCohort === "K26" &&
          classes.every((item) => item.cohort !== "K26") && (
            <p className="mt-3 text-xs text-amber-700">
              Chưa có dữ liệu thời khóa biểu Khóa 26 trong Google Sheet hiện
              tại.
            </p>
          )}
      </section>

      {/* Điều khiển & tổng quan */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {classes.length} lớp trong thời khóa biểu · {ROOMS.length} phòng
              khả dụng
            </p>
            <p className="text-xs text-muted-foreground">
              Sau khi phân bổ, các lịch được lưu cố định. Lớp mới chỉ được xếp
              vào tiết còn trống, không thay đổi phòng của các lớp đã xếp.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetData}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RotateCcw className="size-4" />
            Khôi phục TKB mẫu
          </button>
          <button
            type="button"
            onClick={handleSchedule}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Wand2 className="size-4" />
            Sắp xếp tự động
          </button>
        </div>
      </div>

      {result && (
        <section
          className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
          aria-label="Kết quả sắp xếp"
        >
          <ResultStat
            icon={<Layers className="size-5" />}
            label="Tổng lớp"
            value={classes.length}
            tone="navy"
          />
          <ResultStat
            icon={<CheckCircle2 className="size-5" />}
            label="Đã xếp phòng"
            value={displayAssignments.length}
            tone="green"
          />
          <ResultStat
            icon={<AlertTriangle className="size-5" />}
            label="Bị đẩy ra ngoài"
            value={result.unassigned.length}
            tone="red"
            onClick={() =>
              document
                .getElementById("unassigned-classes")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
          <ResultStat
            icon={<Users className="size-5" />}
            label="Sĩ số đã bố trí"
            value={displayAssignments.reduce(
              (s, a) => s + (classById.get(a.classId)?.size ?? 0),
              0,
            )}
            tone="amber"
          />
        </section>
      )}

      <section
        aria-label="Chọn cơ sở phòng học"
        className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <Building2 className="size-4 text-primary" />
          Khu vực phòng học
        </div>
        <div className="grid w-full gap-2 md:grid-cols-3">
          {(Object.keys(CAMPUS_LABELS) as CampusFilter[]).map((campus) => {
            const count =
              campus === "all"
                ? ROOMS.length
                : ROOMS.filter((room) => room.campus === campus).length;
            const isAll = campus === "all";
            return (
              <button
                key={campus}
                type="button"
                onClick={() => {
                  setSelectedCampus(campus);
                  setSelectedBuilding("all");
                }}
                className={[
                  "group relative h-[59px] overflow-hidden rounded-lg border px-3 py-2 text-left transition-all",
                  selectedCampus === campus
                    ? isAll
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : campus === "36 Xuân La"
                        ? "border-sky-300 bg-sky-100 text-sky-950 shadow-md"
                        : "border-violet-300 bg-violet-100 text-violet-950 shadow-md"
                    : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                ].join(" ")}
              >
                <span className="relative block text-sm font-bold leading-5">
                  {CAMPUS_LABELS[campus]}
                </span>
                <span
                  className={[
                    "relative block text-sm font-semibold leading-5 tabular-nums",
                    selectedCampus === campus
                      ? isAll
                        ? "text-primary-foreground/75"
                        : "text-slate-500"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  {count} phòng
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 space-y-3 border-t border-border/70 pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Chọn tòa
          </p>
          <button
            type="button"
            onClick={() => setSelectedBuilding("all")}
            className={[
              "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all",
              selectedBuilding === "all"
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
            ].join(" ")}
          >
            Tất cả tòa
          </button>
          {buildingGroups
            .filter(
              (group) =>
                selectedCampus === "all" || group.campus === selectedCampus,
            )
            .map((group) => (
              <div
                key={group.campus}
                className="rounded-xl border border-border/70 bg-card/60 p-3"
              >
                <p className="mb-2 text-xs font-bold text-muted-foreground">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.buildings.map((building) => (
                    <button
                      key={building}
                      type="button"
                      onClick={() => setSelectedBuilding(building)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                        selectedBuilding === building
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
                      ].join(" ")}
                    >
                      {building === "HoiTruong"
                        ? "Hội trường"
                        : `Tòa ${buildingOrder(building)}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </section>

      {result && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="size-4" />
            Vùng dự trù K26
          </div>
          <p className="mt-1 text-xs leading-5">
            Hệ thống khóa các phòng chưa dùng của K23–K25 theo từng Thứ + ca;
            mục tiêu ca sáng và chiều là tối thiểu 18 phòng.
          </p>
          {result.reserveWarnings.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {result.reserveWarnings.slice(0, 4).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              Tất cả khung sáng/chiều đều đạt mức dự trù tối thiểu.
            </p>
          )}
        </section>
      )}

      {!result && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-white/40 py-14 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarDays className="size-7" />
          </div>
          <p className="max-w-md text-balance text-sm text-muted-foreground">
            Thêm lớp mới nếu cần, rồi bấm{" "}
            <span className="font-semibold text-foreground">
              Sắp xếp tự động
            </span>{" "}
            để hệ thống phân bổ phòng học theo thời khóa biểu và hiển thị lịch
            tuần bên dưới.
          </p>
        </div>
      )}

      {result && (
        <>
          <NewClassesPanel
            classes={newClassIds
              .map((id) => classById.get(id))
              .filter((item): item is ClassInfo => Boolean(item))}
            result={result}
            onShowAssignment={showAssignment}
          />
          {/* Bộ chọn thứ trong tuần */}
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Thứ trong tuần"
          >
            {DAYS.map((day) => {
              const active = day === selectedDay;
              const count = assignedCountByDay.get(day) ?? 0;
              return (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedDay(day)}
                  className={[
                    "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
                  ].join(" ")}
                >
                  <CalendarDays className="size-4" />
                  {DAY_LABELS[day]}
                  <span
                    className={[
                      "flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
                      active
                        ? "bg-white/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Lịch phòng theo ca */}
          <section
            aria-label={`Lịch phòng ${COHORT_LABELS[selectedCohort]} ${DAY_LABELS[selectedDay]}`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-primary">
                  Lịch phòng học đã phân bổ
                </p>
                <p className="text-xs text-muted-foreground">
                  {COHORT_LABELS[selectedCohort]} · {DAY_LABELS[selectedDay]}
                </p>
              </div>
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                {dayAssignments.length} lớp đã có phòng
              </span>
            </div>
            <div className="mb-4 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <label
                htmlFor="schedule-search"
                className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"
              >
                <Search className="size-4 text-primary" />
                  Tìm kiếm lớp học
              </label>
              <div className="relative">
                <input
                  id="schedule-search"
                  type="search"
                  value={scheduleSearch}
                  onChange={(event) => setScheduleSearch(event.target.value)}
                  placeholder="Nhập tên môn học, tên lớp hoặc mã học phần..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/40"
                />
                {scheduleSearch && (
                  <button
                    type="button"
                    onClick={() => setScheduleSearch("")}
                    aria-label="Xóa tìm kiếm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {scheduleSearch.trim() && (
                <div className="mt-3">
                  {searchResults.length === 0 ? (
                    <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      Không tìm thấy môn học hoặc lớp phù hợp với bộ lọc hiện
                      tại.
                    </p>
                  ) : (
                    <ul className="grid gap-2 md:grid-cols-2">
                      {searchResults.map((assignment) => {
                        const cls = classById.get(assignment.classId);
                        const room = roomById.get(assignment.roomId);
                        if (!cls || !room) return null;
                        return (
                          <li
                            key={`search-${assignment.classId}`}
                            className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">
                                  {cls.name}
                                </p>
                                {cls.className && (
                                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                                    Lớp: {cls.className}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${capacityTone(room.capacity)}`}
                              >
                                {room.name}
                              </span>
                            </div>
                            <div className="mt-2 grid gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                              <p>
                                Mã học phần: {getCourseCode(cls) ?? "Chưa có"}
                              </p>
                              <p>
                                Số tín chỉ: {getCourseCredits(cls) ?? "Chưa có"}
                              </p>
                              <p>
                                Khóa: {cls.cohort ?? "Chưa có"} · Sĩ số: {cls.size}
                              </p>
                              <p>
                                Cơ sở: {room.campus ?? "Chưa có"}
                              </p>
                              <p className="sm:col-span-2">
                                Lịch: {DAY_LABELS[assignment.day]} · Ca{" "}
                                {SHIFT_LABELS[assignment.shift]} · Tiết{" "}
                                {assignment.startPeriod}–{assignment.endPeriod} ·{" "}
                                {rangeTime(assignment.startPeriod, assignment.endPeriod)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => showAssignment(assignment)}
                              className="mt-2 text-xs font-semibold text-primary hover:underline"
                            >
                              Xem trong lịch
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {SHIFTS.map((shift) => {
                const shiftItems = dayAssignments
                  .filter((a) => a.shift === shift)
                  .sort((a, b) => a.startPeriod - b.startPeriod);
                const roomsWithFreePeriods = ROOMS.filter(
                  (room) =>
                    (selectedCampus === "all" ||
                      room.campus === selectedCampus) &&
                    (selectedBuilding === "all" ||
                      room.building === selectedBuilding),
                )
                  .map((room) => {
                    const occupiedPeriods = new Set(
                      displayAssignments
                        .filter(
                          (assignment) =>
                            assignment.roomId === room.id &&
                            assignment.day === selectedDay &&
                            assignment.shift === shift,
                        )
                        .flatMap((assignment) =>
                          SHIFT_PERIODS[shift].filter(
                            (period) =>
                              period >= assignment.startPeriod &&
                              period <= assignment.endPeriod,
                          ),
                        ),
                    );
                    return {
                      room,
                      freePeriods: SHIFT_PERIODS[shift].filter(
                        (period) => !occupiedPeriods.has(period),
                      ),
                    };
                  })
                  .filter((item) => item.freePeriods.length > 0)
                  .sort((a, b) =>
                    a.room.name.localeCompare(b.room.name, "vi", {
                      numeric: true,
                    }),
                  );
                return (
                  <div
                    key={shift}
                    className="flex flex-col rounded-2xl border border-white/60 bg-white/60 p-4 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl"
                  >
                    <div
                      className={`mb-3 flex items-center justify-between rounded-xl border px-3 py-2 ${SHIFT_TONE[shift]}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-bold">
                        {SHIFT_ICON[shift]}
                        Ca {SHIFT_LABELS[shift]}
                      </span>
                      <span className="text-xs font-medium">
                        Tiết {SHIFT_PERIODS[shift][0]}–
                        {SHIFT_PERIODS[shift][SHIFT_PERIODS[shift].length - 1]}
                      </span>
                    </div>

                    {shiftItems.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Chưa có lớp nào trong ca này.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {CAMPUS_SCHEDULE_GROUPS.map((group) => {
                          const campusItems = shiftItems.filter(
                            (assignment) =>
                              roomById.get(assignment.roomId)?.campus ===
                              group.campus,
                          );
                          if (campusItems.length === 0) return null;
                          return (
                            <section
                              key={group.campus}
                              aria-label={group.label}
                            >
                              <div
                                className={`mb-3 rounded-xl border px-3.5 py-3 ${group.tone}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-bold">
                                      {group.label}
                                    </p>
                                    <p className="mt-0.5 text-[11px] opacity-75">
                                      Các lớp đã được xếp phòng tại cơ sở này
                                    </p>
                                  </div>
                                  <span className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold">
                                    {campusItems.length} lớp
                                  </span>
                                </div>
                              </div>
                              <ul className="flex flex-col gap-2.5">
                                {campusItems.map((a) => {
                                  const cls = classById.get(a.classId);
                                  const room = roomById.get(a.roomId);
                                  const courseCode = cls ? getCourseCode(cls) : undefined;
                                  const credits = cls ? getCourseCredits(cls) : undefined;
                                  const expectedCourseEnd = cls
                                    ? formatCourseEnd(
                                        courseTimelines.get(cls.id)?.courseEndAt,
                                      )
                                    : null;
                                  const isBorrowed =
                                    a.classId.startsWith("borrow-");
                                  if (!cls || !room) return null;
                                  return (
                                    <li
                                      key={a.classId}
                                      id={`assignment-${a.classId}`}
                                      data-assignment-card
                                      onClick={() =>
                                        setHighlightedClassId((current) =>
                                          current === a.classId
                                            ? current
                                            : null,
                                        )
                                      }
                                      className={[
                                        "rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-md",
                                        highlightedClassId === a.classId
                                          ? "border-amber-400 bg-amber-50/70 shadow-[0_0_0_4px_rgba(251,191,36,0.28),0_0_24px_rgba(251,191,36,0.35)]"
                                          : "border-border",
                                      ].join(" ")}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-pretty text-sm font-semibold leading-tight text-foreground">
                                            {cls.name}
                                          </p>
                                          {courseCode && (
                                            <p className="mt-1 text-xs font-semibold text-sky-500">
                                              {courseCode}
                                            </p>
                                          )}
                                          {cls.className && (
                                            <p className="mt-1 break-words text-xs font-medium leading-4 text-muted-foreground">
                                              Lớp: {cls.className}
                                            </p>
                                          )}
                                          {credits !== undefined && (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                              {credits} tín chỉ
                                            </p>
                                          )}
                                          {expectedCourseEnd && (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                              Dự kiến kết thúc môn: {expectedCourseEnd}
                                            </p>
                                          )}
                                        </div>
                                        <span
                                          className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${capacityTone(room.capacity)}`}
                                        >
                                          {room.name}
                                        </span>
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                          <Users className="size-3.5" />
                                          {cls.size}/{room.capacity} chỗ
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <CalendarDays className="size-3.5" />
                                          Tiết {a.startPeriod}
                                          {a.endPeriod !== a.startPeriod
                                            ? `–${a.endPeriod}`
                                            : ""}
                                        </span>
                                        <span className="font-mono">
                                          {rangeTime(
                                            a.startPeriod,
                                            a.endPeriod,
                                          )}
                                        </span>
                                      </div>
                                      {!isBorrowed && (
                                        <AssignmentEditor
                                          assignment={a}
                                          classInfo={cls}
                                          assignments={result.assignments}
                                          open={editingClassId === cls.id}
                                          onToggle={() =>
                                            setEditingClassId((current) =>
                                              current === cls.id
                                                ? null
                                                : cls.id,
                                            )
                                          }
                                          onMove={handleMoveClass}
                                        />
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </section>
                          );
                        })}
                      </div>
                    )}
                    <details className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
                        Phòng còn tiết trống ({roomsWithFreePeriods.length})
                      </summary>
                      {roomsWithFreePeriods.length === 0 ? (
                        <p className="mt-2 text-xs text-emerald-800">
                          Không còn tiết trống trong ca này theo bộ lọc cơ sở/tòa.
                        </p>
                      ) : (
                        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {roomsWithFreePeriods.map(({ room, freePeriods }) => (
                            <li
                              key={room.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-2.5 py-2 text-xs"
                            >
                              <span className="font-semibold text-slate-800">
                                {room.name} · {room.capacity} chỗ
                              </span>
                              <span className="text-emerald-800">
                                Tiết {freePeriods.join(", ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                  </div>
                );
              })}
            </div>
          </section>

          <UnassignedPanel result={result} onPlace={handlePlaceClass} />
        </>
      )}

      {/* Danh sách lớp chỉ dùng trước khi chạy xếp phòng. Sau đó ưu tiên hiển thị lịch phòng. */}
      {!result && (
        <ClassListPanel classes={classes} onRemove={handleRemoveClass} />
      )}
    </div>
  );
}

function ResultStat({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "navy" | "green" | "red" | "amber";
  onClick?: () => void;
}) {
  const tones = {
    navy: "text-primary bg-primary/10",
    green: "text-emerald-600 bg-emerald-500/10",
    red: "text-red-600 bg-red-500/10",
    amber: "text-amber-600 bg-amber-500/10",
  } as const;
  const content = (
    <>
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-2xl font-bold tabular-nums text-foreground">
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </>
  );
  const className =
    "flex items-center gap-3 rounded-2xl border border-white/60 bg-white/60 p-4 text-left shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${className} cursor-pointer transition-shadow hover:shadow-md`}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function AddClassForm({
  onAdd,
}: {
  onAdd: (cls: Omit<ClassInfo, "id">) => string | null;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState("50");
  const [day, setDay] = useState<number>(2);
  const [shift, setShift] = useState<Shift>("morning");
  const [periods, setPeriods] = useState("2");
  const [error, setError] = useState<string | null>(null);

  const maxPeriods = SHIFT_PERIODS[shift].length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedSize = Number.parseInt(size, 10);
    const parsedPeriods = Number.parseInt(periods, 10);
    if (!name.trim()) {
      setError("Vui lòng nhập tên môn/lớp.");
      return;
    }
    if (!Number.isFinite(parsedSize) || parsedSize <= 0) {
      setError("Sĩ số phải là số lớn hơn 0.");
      return;
    }
    const addError = onAdd({
      name: name.trim(),
      size: parsedSize,
      day,
      shift,
      periods: Math.min(Math.max(parsedPeriods || 1, 1), maxPeriods),
    });
    if (addError) {
      setError(addError);
      return;
    }
    setError(null);
    setName("");
    setSize("50");
    setPeriods("2");
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Plus className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">
            Thêm lớp mới vào thời khóa biểu
          </h2>
          <p className="text-xs text-muted-foreground">
            Nhập thông tin lớp học phần cần bố trí phòng.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-4">
          <label
            htmlFor="cls-name"
            className="mb-1 block text-xs font-semibold text-foreground"
          >
            Tên lớp / học phần
          </label>
          <input
            id="cls-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Luật Hành chính"
            className={inputClass}
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="cls-size"
            className="mb-1 block text-xs font-semibold text-foreground"
          >
            Sĩ số
          </label>
          <input
            id="cls-size"
            type="number"
            min={1}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="cls-day"
            className="mb-1 block text-xs font-semibold text-foreground"
          >
            Thứ
          </label>
          <select
            id="cls-day"
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            className={inputClass}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {DAY_LABELS[d]}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="cls-shift"
            className="mb-1 block text-xs font-semibold text-foreground"
          >
            Ca học
          </label>
          <select
            id="cls-shift"
            value={shift}
            onChange={(e) => setShift(e.target.value as Shift)}
            className={inputClass}
          >
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {SHIFT_LABELS[s]} (tiết {SHIFT_PERIODS[s][0]}–
                {SHIFT_PERIODS[s][SHIFT_PERIODS[s].length - 1]})
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="cls-periods"
            className="mb-1 block text-xs font-semibold text-foreground"
          >
            Số tiết (tối đa {maxPeriods})
          </label>
          <input
            id="cls-periods"
            type="number"
            min={1}
            max={maxPeriods}
            value={periods}
            onChange={(e) => setPeriods(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        >
          <Plus className="size-4" />
          Thêm lớp
        </button>
      </div>
    </form>
  );
}

function NewClassesPanel({
  classes,
  result,
  onShowAssignment,
}: {
  classes: ClassInfo[];
  result: ScheduleResult;
  onShowAssignment: (assignment: import("@/lib/scheduling").Assignment) => void;
}) {
  if (classes.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5"
      aria-label="Danh sách lớp mới thêm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
            <PlusCircle className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              Lớp mới thêm ({classes.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Lớp đã được thêm vào danh sách. Bấm nút để chạy lại thuật toán
              phân bổ phòng.
            </p>
          </div>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {classes.map((classInfo) => {
          const assignment = result.assignments.find(
            (item) => item.classId === classInfo.id,
          );
          const assignedRoom = assignment
            ? ROOMS.find((room) => room.id === assignment.roomId)
            : undefined;
          const isAssigned = Boolean(assignment);
          return (
            <li
              key={classInfo.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-white/70 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {classInfo.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {classInfo.size > 0 ? `${classInfo.size} SV` : "Chưa nhập sĩ số"} ·{" "}
                  {classInfo.needsReview?.some((field) => field !== "sĩ số")
                    ? `Cần bổ sung ${classInfo.needsReview.filter((field) => field !== "sĩ số").join(", ")}`
                    : `${DAY_SHORT[classInfo.day]} · ${SHIFT_LABELS[classInfo.shift]} · ${classInfo.periods} tiết`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-bold ${isAssigned ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                >
                  {isAssigned ? `Đã xếp ${assignment?.roomId}` : "Chưa xếp"}
                </span>
                {assignedRoom?.campus && (
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {assignedRoom.campus}
                  </span>
                )}
                {assignment && (
                  <button
                    type="button"
                    onClick={() => onShowAssignment(assignment)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Xem trong lịch
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AssignmentEditor({
  assignment,
  classInfo,
  assignments,
  open,
  onToggle,
  onMove,
}: {
  assignment: import("@/lib/scheduling").Assignment;
  classInfo: ClassInfo;
  assignments: import("@/lib/scheduling").Assignment[];
  open: boolean;
  onToggle: () => void;
  onMove: (classId: string, alt: AltSlot) => void;
}) {
  const alternatives = useMemo(() => {
    const allSlots = findAlternatives(
      classInfo,
      ROOMS,
      assignments.filter((item) => item.classId !== assignment.classId),
      500,
    );
    return allSlots;
  }, [assignment.classId, assignments, classInfo]);

  return (
    <div className="mt-3 border-t border-dashed border-border pt-2.5">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pencil className="size-3.5" />
        {open ? "Đóng chỉnh sửa" : "Đổi phòng / lịch học"}
      </button>
      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-schedule-title-${classInfo.id}`}
            onClick={onToggle}
          >
            <div
              className="flex max-h-[82vh] w-[calc(100vw-2rem)] max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-white/70 bg-background shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border bg-primary px-5 py-4 text-primary-foreground">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/75">
                    Chỉnh sửa lịch phòng
                  </p>
                  <h3
                    id={`edit-schedule-title-${classInfo.id}`}
                    className="mt-1 text-lg font-bold"
                  >
                    {classInfo.name}
                  </h3>
                  <p className="mt-1 text-xs text-primary-foreground/80">
                    {classInfo.size} sinh viên · Chọn phòng và lịch ở bất kỳ
                    ngày nào trong tuần
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Đóng bảng chọn lịch"
                  className="rounded-lg p-2 text-primary-foreground/80 transition-colors hover:bg-white/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="min-h-0 overflow-auto p-5 sm:p-6">
                <p className="mb-3 text-sm font-semibold text-foreground">
                  Các phòng còn phù hợp được chia theo từng ngày:
                </p>
                {alternatives.length === 0 ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    Không còn slot phù hợp khác.
                  </p>
                ) : (
                  <AlternativeColumns
                    alternatives={alternatives}
                    onSelect={(alt) => onMove(classInfo.id, alt)}
                  />
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

function AlternativeColumns({
  alternatives,
  onSelect,
}: {
  alternatives: AltSlot[];
  onSelect: (alternative: AltSlot) => void;
}) {
  const campuses = [
    {
      campus: "36 Xuân La" as const,
      label: "Cơ sở 36 Xuân La",
      tone: "border-sky-200 bg-sky-50/70 text-sky-800",
    },
    {
      campus: "371 Nguyễn Hoàng Tôn" as const,
      label: "Cơ sở 371 Nguyễn Hoàng Tôn",
      tone: "border-violet-200 bg-violet-50/70 text-violet-800",
    },
  ];

  return (
    <div className="grid min-w-[960px] grid-cols-6 gap-3">
      {DAYS.map((day) => {
        const dayAlternatives = alternatives.filter(
          (alternative) => alternative.day === day,
        );
        return (
          <div
            key={day}
            className="min-w-0 rounded-xl border border-border bg-card/70 p-3"
          >
            <p className="mb-3 border-b border-border pb-2 text-sm font-bold text-foreground">
              {DAY_LABELS[day]}
            </p>
            {dayAlternatives.length === 0 ? (
              <p className="py-3 text-xs leading-4 text-muted-foreground">
                Không có slot phù hợp
              </p>
            ) : (
              <div className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1">
                {campuses.map((group) => {
                  const campusAlternatives = dayAlternatives.filter(
                    (alternative) =>
                      ROOMS.find((room) => room.id === alternative.roomId)
                        ?.campus === group.campus,
                  );
                  if (campusAlternatives.length === 0) return null;
                  return (
                    <section key={group.campus} className="space-y-1.5">
                      <div
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${group.tone}`}
                      >
                        {group.label}
                        <span className="ml-1 font-medium opacity-75">
                          ({campusAlternatives.length} phòng)
                        </span>
                      </div>
                      {campusAlternatives.map((alternative, index) => (
                        <button
                          key={`${alternative.day}-${alternative.shift}-${alternative.roomId}-${alternative.startPeriod}-${index}`}
                          type="button"
                          onClick={() => onSelect(alternative)}
                          className="w-full rounded-lg border border-primary/20 bg-background px-3 py-2.5 text-left text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="font-bold">
                            {alternative.roomId}
                          </span>
                          <span className="block text-muted-foreground">
                            {SHIFT_LABELS[alternative.shift]} · tiết{" "}
                            {alternative.startPeriod}
                            {alternative.endPeriod !== alternative.startPeriod
                              ? `–${alternative.endPeriod}`
                              : ""}
                          </span>
                        </button>
                      ))}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  return mounted ? createPortal(children, document.body) : null;
}

function UnassignedPanel({
  result,
  onPlace,
}: {
  result: ScheduleResult;
  onPlace: (classInfo: ClassInfo, alt: AltSlot) => void;
}) {
  if (result.unassigned.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
        <CheckCircle2 className="size-6 shrink-0 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-800">
          Tất cả lớp đã được bố trí phòng thành công. Không có lớp nào bị đẩy ra
          ngoài.
        </p>
      </div>
    );
  }

  return (
    <div
      id="unassigned-classes"
      className="scroll-mt-6 rounded-2xl border border-red-200 bg-red-50/60 p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="size-5 text-red-600" />
        <h3 className="text-base font-bold text-red-800">
          {result.unassigned.length} lớp chưa xếp được (bị đẩy ra ngoài)
        </h3>
      </div>
      <ul className="flex flex-col gap-3">
        {result.unassigned.map((u) => (
          <UnassignedItem
            key={u.classInfo.id}
            classInfo={u.classInfo}
            reason={u.reason}
            assignments={result.assignments}
            onPlace={onPlace}
          />
        ))}
      </ul>
    </div>
  );
}

function UnassignedItem({
  classInfo,
  reason,
  assignments,
  onPlace,
}: {
  classInfo: ClassInfo;
  reason: string;
  assignments: import("@/lib/scheduling").Assignment[];
  onPlace: (classInfo: ClassInfo, alt: AltSlot) => void;
}) {
  const [alts, setAlts] = useState<AltSlot[] | null>(null);

  function handleFind() {
    setAlts(findAlternatives(classInfo, ROOMS, assignments, 500));
  }

  return (
    <li className="rounded-xl border border-red-200 bg-white/80 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-foreground">
              {classInfo.name}
            </p>
            <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-700">
              {classInfo.size > 0 ? `${classInfo.size} SV` : "Chưa nhập sĩ số"}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {classInfo.needsReview?.some((field) => field !== "sĩ số")
                ? `Cần bổ sung ${classInfo.needsReview.filter((field) => field !== "sĩ số").join(", ")}`
                : `${DAY_SHORT[classInfo.day]} · ${SHIFT_LABELS[classInfo.shift]} · ${classInfo.periods} tiết`}
            </span>
          </div>
          <p className="mt-1 text-xs text-red-700">{reason}</p>
        </div>
        <button
          type="button"
          onClick={handleFind}
          disabled={classInfo.size < 1 || Boolean(classInfo.needsReview?.length)}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Sparkles className="size-4" />
          {classInfo.size < 1 || classInfo.needsReview?.length
            ? "Cần bổ sung sĩ số"
            : "Tìm slot thay thế"}
        </button>
      </div>

      {alts !== null && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`unassigned-title-${classInfo.id}`}
            onClick={() => setAlts(null)}
          >
            <div
              className="flex max-h-[82vh] w-[calc(100vw-2rem)] max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-white/70 bg-background shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border bg-red-600 px-5 py-4 text-white">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-white/75">
                    Chọn slot thay thế
                  </p>
                  <h3
                    id={`unassigned-title-${classInfo.id}`}
                    className="mt-1 text-lg font-bold"
                  >
                    {classInfo.name}
                  </h3>
                  <p className="mt-1 text-xs text-white/80">
                    {classInfo.size} sinh viên · Chọn phòng và lịch ở bất kỳ
                    ngày nào trong tuần
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAlts(null)}
                  aria-label="Đóng bảng chọn slot"
                  className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 overflow-auto p-5 sm:p-6">
                <p className="mb-3 text-sm font-semibold text-foreground">
                  Các phòng còn phù hợp được chia theo từng ngày:
                </p>
                {alts.length === 0 ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    Không tìm thấy thứ/ca/phòng nào còn trống đủ khả năng cho
                    lớp này trong tuần.
                  </p>
                ) : (
                  <AlternativeColumns
                    alternatives={alts}
                    onSelect={(alt) => onPlace(classInfo, alt)}
                  />
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </li>
  );
}

function ClassListPanel({
  classes,
  onRemove,
}: {
  classes: ClassInfo[];
  onRemove: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    return DAYS.map((day) => ({
      day,
      items: classes
        .filter((c) => c.day === day)
        .sort((a, b) => b.size - a.size),
    })).filter((g) => g.items.length > 0);
  }, [classes]);
  const courseTimelines = useMemo(
    () => getCourseMeetingTimelines(classes),
    [classes],
  );

  return (
    <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays className="size-5 text-primary" />
        <h2 className="text-base font-bold text-foreground">
          Thời khóa biểu hiện tại ({classes.length} lớp)
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {grouped.map((g) => (
          <div
            key={g.day}
            className="rounded-xl border border-border bg-card/60 p-3"
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {DAY_LABELS[g.day]}
            </p>
            <ul className="flex flex-col gap-2">
              {g.items.map((c) => {
                const courseCode = getCourseCode(c);
                const displayClassName = c.className;
                const credits = getCourseCredits(c);
                const formattedCourseEnd = formatCourseEnd(
                  courseTimelines.get(c.id)?.courseEndAt,
                );

                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.name}
                      </p>
                      {(displayClassName || credits !== undefined) && (
                        <p className="truncate text-xs">
                          {courseCode && (
                            <span className="font-semibold text-sky-500">
                              {courseCode}
                            </span>
                          )}
                          {displayClassName && (
                            <span className="ml-2 text-muted-foreground">
                              Lớp: {displayClassName}
                            </span>
                          )}
                          {credits !== undefined && (
                            <span className="ml-2 text-muted-foreground">
                              {credits} tín chỉ
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {c.size} SV · {SHIFT_LABELS[c.shift]} · {c.periods} tiết
                      </p>
                      {formattedCourseEnd && (
                        <p className="mt-1 text-xs text-slate-500">
                          Dự kiến kết thúc môn: {formattedCourseEnd}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(c.id)}
                      aria-label={`Xóa lớp ${c.name}`}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
