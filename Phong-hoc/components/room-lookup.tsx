"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Users,
  Clock,
  RotateCcw,
  DoorOpen,
  BookOpen,
  KeyRound,
  X,
  AlertTriangle,
  CheckCircle2,
  Ban,
  ListFilter,
  CalendarDays,
} from "lucide-react";
import {
  autoSchedule,
  CAMPUS_LABELS,
  COHORT_LABELS,
  rangeTime,
  type CampusFilter,
  type CohortFilter,
  type RoomInfo,
} from "@/lib/scheduling";
import { SHEET_CLASSES, SHEET_ROOMS } from "@/lib/schedule-data";
import {
  ALLOCATION_UPDATED_EVENT,
  loadAllocationSnapshot,
  type AllocationSnapshot,
} from "@/lib/allocation-store";
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  addBorrowRequest,
  getSchedulingDay,
  isBorrowRequestInWeek,
  loadBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store";

type RoomStatus = "available" | "in-class" | "booked";

type ClassBlock = { day: number; start: string; end: string; name: string };

type RoomBase = {
  id: string;
  capacity: number;
  building?: string;
  campus?: RoomInfo["campus"];
  blocks: ClassBlock[];
};

type Booking = { until: string; borrower: string };

type RoomView = {
  id: string;
  capacity: number;
  building?: string;
  campus?: RoomInfo["campus"];
  status: RoomStatus;
  className?: string;
  classEnd?: string;
  nextClass: string | null;
  borrower?: string;
  bookedUntil?: string;
};

const BUFFER_MINUTES = 15;
const END_OF_DAY = "22:00";
const DURATION_OPTIONS = [30, 60, 75, 90];

const WEEKDAY_LABELS = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

/**
 * Thời khóa biểu chính khóa trong NGÀY của từng phòng.
 * Trạng thái phòng (trống / đang có lớp) được tính theo GIỜ THỰC hiện tại
 * so với các khối giờ này.
 */
function createRoomSchedules(
  cohort: CohortFilter,
  snapshot: AllocationSnapshot | null,
): RoomBase[] {
  const classes = snapshot
    ? snapshot.classes.filter(
        (item) => cohort === "all" || item.cohort === cohort,
      )
    : cohort === "all"
      ? SHEET_CLASSES
      : SHEET_CLASSES.filter((item) => item.cohort === cohort);
  const result = snapshot
    ? {
        ...snapshot.result,
        assignments: snapshot.result.assignments.filter((assignment) =>
          classes.some((item) => item.id === assignment.classId),
        ),
      }
    : autoSchedule(classes, SHEET_ROOMS);
  const classById = new Map(classes.map((item) => [item.id, item]));
  const roomById = new Map(SHEET_ROOMS.map((item) => [item.id, item]));
  const blocksByRoom = new Map<string, ClassBlock[]>();

  for (const assignment of result.assignments) {
    const cls = classById.get(assignment.classId);
    if (!cls) continue;
    const blocks = blocksByRoom.get(assignment.roomId) ?? [];
    blocks.push({
      day: assignment.day,
      start: rangeTime(assignment.startPeriod, assignment.startPeriod).split(
        " - ",
      )[0],
      end: rangeTime(assignment.startPeriod, assignment.endPeriod).split(
        " - ",
      )[1],
      name: cls.name,
    });
    blocksByRoom.set(assignment.roomId, blocks);
  }

  return (SHEET_ROOMS as RoomInfo[]).map((room) => ({
    id: room.id,
    capacity: room.capacity,
    building: room.building,
    campus: room.campus,
    blocks: blocksByRoom.get(room.id) ?? [],
  }));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function addMinutes(hhmm: string, minutes: number): string {
  const total = toMinutes(hhmm) + minutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function periodAtMinutes(value: number): number {
  if (value < 13 * 60)
    return Math.min(5, Math.max(1, 1 + Math.floor((value - 7 * 60) / 50)));
  if (value < 18 * 60)
    return Math.min(10, Math.max(6, 6 + Math.floor((value - 13 * 60) / 50)));
  return Math.min(13, Math.max(11, 11 + Math.floor((value - 18 * 60) / 50)));
}

function shiftAtPeriod(period: number): "morning" | "afternoon" | "evening" {
  if (period <= 5) return "morning";
  if (period <= 10) return "afternoon";
  return "evening";
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} tiếng ${m} phút`;
  if (h > 0) return `${h} tiếng`;
  return `${m} phút`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Tính trạng thái phòng theo giờ thực (số phút trong ngày) + lượt mượn tạm. */
function computeRoomView(
  base: RoomBase,
  nowMin: number,
  nowDay: number,
  booking?: Booking,
): RoomView {
  // Lượt mượn tạm còn hiệu lực -> ưu tiên hiển thị "đang mượn".
  if (booking && nowMin < toMinutes(booking.until)) {
    return {
      id: base.id,
      capacity: base.capacity,
      building: base.building,
      campus: base.campus,
      status: "booked",
      borrower: booking.borrower,
      bookedUntil: booking.until,
      nextClass: nextClassAfter(base, nowMin, nowDay),
    };
  }

  const current = base.blocks.find(
    (b) =>
      b.day === nowDay &&
      nowMin >= toMinutes(b.start) &&
      nowMin < toMinutes(b.end),
  );
  if (current) {
    return {
      id: base.id,
      capacity: base.capacity,
      building: base.building,
      campus: base.campus,
      status: "in-class",
      className: current.name,
      classEnd: current.end,
      nextClass: nextClassAfter(base, nowMin, nowDay),
    };
  }

  return {
    id: base.id,
    capacity: base.capacity,
    building: base.building,
    campus: base.campus,
    status: "available",
    nextClass: nextClassAfter(base, nowMin, nowDay),
  };
}

function approvedBookingAtNow(
  requests: BorrowRequest[],
  roomId: string,
  nowDay: number,
  nowMin: number,
): BorrowRequest | undefined {
  return requests.find((request) => {
    if (
      !isBorrowRequestInWeek(request) ||
      request.status !== "approved" ||
      request.roomId !== roomId ||
      request.day !== nowDay
    )
      return false;
    const [start, end] = rangeTime(
      request.startPeriod,
      request.endPeriod,
    ).split(" - ");
    return nowMin >= toMinutes(start) && nowMin < toMinutes(end);
  });
}

function nextClassAfter(
  base: RoomBase,
  nowMin: number,
  nowDay: number,
): string | null {
  const upcoming = base.blocks
    .filter((b) => b.day === nowDay && toMinutes(b.start) > nowMin)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return upcoming[0]?.start ?? null;
}

type Filter = "all" | "available" | "in-class" | "booked";
type BuildingFilter = "all" | string;

function campusOrder(campus?: RoomInfo["campus"]): number {
  return campus === "36 Xuân La"
    ? 0
    : campus === "371 Nguyễn Hoàng Tôn"
      ? 1
      : campus === "77 NCT"
        ? 2
        : 3;
}

function buildingOrder(building?: string): string {
  if (!building) return "ZZZ";
  if (building === "HoiTruong") return "ZZZ";
  if (building.includes("-")) return building.split("-").at(-1) ?? building;
  return building;
}

function roomOrder(a: RoomView, b: RoomView): number {
  const campusDifference = campusOrder(a.campus) - campusOrder(b.campus);
  if (campusDifference !== 0) return campusDifference;
  const buildingDifference = buildingOrder(a.building).localeCompare(
    buildingOrder(b.building),
    "vi",
  );
  if (buildingDifference !== 0) return buildingDifference;
  return a.id.localeCompare(b.id, "en", { numeric: true });
}

export function RoomLookup() {
  const [cohort, setCohort] = useState<CohortFilter>("all");
  const [allocationSnapshot, setAllocationSnapshot] =
    useState<AllocationSnapshot | null>(null);
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([]);
  const schedules = useMemo(
    () => createRoomSchedules(cohort, allocationSnapshot),
    [cohort, allocationSnapshot],
  );
  const [now, setNow] = useState<Date | null>(null);
  const [bookings, setBookings] = useState<Record<string, Booking>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [campus, setCampus] = useState<CampusFilter>("all");
  const [building, setBuilding] = useState<BuildingFilter>("all");

  // Đồng hồ thời gian thực: cập nhật mỗi giây.
  useEffect(() => {
    const refreshAllocation = () =>
      setAllocationSnapshot(loadAllocationSnapshot());
    refreshAllocation();
    window.addEventListener(ALLOCATION_UPDATED_EVENT, refreshAllocation);
    return () =>
      window.removeEventListener(ALLOCATION_UPDATED_EVENT, refreshAllocation);
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
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : 0;

  const nowDay = now ? getSchedulingDay(now) : 2;

  const views = useMemo(
    () =>
      schedules.map((room) => {
        const approved = approvedBookingAtNow(
          borrowRequests,
          room.id,
          nowDay,
          nowMin,
        );
        const booking =
          bookings[room.id] ??
          (approved
            ? {
                until: rangeTime(
                  approved.startPeriod,
                  approved.endPeriod,
                ).split(" - ")[1],
                borrower: approved.requester,
              }
            : undefined);
        return computeRoomView(room, nowMin, nowDay, booking);
      }),
    [schedules, nowMin, nowDay, bookings, borrowRequests],
  );

  const stats = useMemo(
    () => ({
      total: views.length,
      available: views.filter((r) => r.status === "available").length,
      inClass: views.filter((r) => r.status === "in-class").length,
      booked: views.filter((r) => r.status === "booked").length,
    }),
    [views],
  );

  const visibleRooms = useMemo(
    () =>
      views
        .filter(
          (room) =>
            (campus === "all" || room.campus === campus) &&
            (building === "all" || room.building === building) &&
            (filter === "all" || room.status === filter),
        )
        .sort(roomOrder),
    [views, filter, campus, building],
  );

  const activeRoom = activeRoomId
    ? (views.find((r) => r.id === activeRoomId) ?? null)
    : null;
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
            schedules
              .filter((room) => room.campus === group.campus)
              .map((room) => room.building)
              .filter((value): value is string => Boolean(value)),
          ),
        ].sort((a, b) =>
          buildingOrder(a).localeCompare(buildingOrder(b), "vi"),
        ),
      })),
    [schedules],
  );

  function handleReset() {
    setBookings({});
    setActiveRoomId(null);
    setFilter("all");
    setCampus("all");
    setBuilding("all");
    setCohort("all");
  }

  function handleCancelBooking(id: string) {
    setBookings((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleConfirmBooking(
    id: string,
    minutes: number,
    requester: string,
    requesterType: "Giảng viên" | "Sinh viên",
    purpose: string,
    size: number,
  ) {
    if (!now) return;
    const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const startPeriod = periodAtMinutes(now.getHours() * 60 + now.getMinutes());
    const endPeriod = Math.min(
      startPeriod + Math.max(1, Math.ceil(minutes / 50)) - 1,
      shiftAtPeriod(startPeriod) === "morning"
        ? 5
        : shiftAtPeriod(startPeriod) === "afternoon"
          ? 10
          : 13,
    );
    addBorrowRequest({
      requester: requester.trim() || "Người đăng ký chưa nhập tên",
      requesterType,
      purpose: purpose.trim() || `Đăng ký mượn phòng ${id}`,
      day: nowDay,
      shift: shiftAtPeriod(startPeriod),
      startPeriod,
      endPeriod,
      size,
    });
    setActiveRoomId(null);
  }

  if (!now) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/60 py-16 text-sm text-muted-foreground">
        <Clock className="size-4 animate-pulse" />
        Đang đồng bộ thời gian thực…
      </div>
    );
  }

  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateLabel = `${WEEKDAY_LABELS[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/70 px-4 py-2.5 shadow-sm backdrop-blur">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="size-5" />
          </div>
          <div className="leading-none">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {dateLabel} · giờ thực
            </span>
            <span className="mt-1 block font-mono text-2xl font-bold tabular-nums text-foreground">
              {clock}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted-foreground md:block">
            Hiện có{" "}
            <span className="font-bold text-red-600">{stats.inClass}</span> lớp
            đang diễn ra ·{" "}
            <span className="font-bold text-emerald-600">
              {stats.available}
            </span>{" "}
            phòng trống
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RotateCcw className="size-4" />
            <span className="hidden sm:inline">Khôi phục</span>
            <span className="sm:hidden">Reset</span>
          </button>
        </div>
      </div>

      <section
        aria-label="Thống kê nhanh"
        className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
      >
        <StatCard
          icon={<Building2 className="size-5" />}
          label="Tổng số phòng"
          value={stats.total}
          tone="navy"
        />
        <StatCard
          icon={<DoorOpen className="size-5" />}
          label="Phòng trống"
          value={stats.available}
          tone="green"
        />
        <StatCard
          icon={<BookOpen className="size-5" />}
          label="Đang có lớp"
          value={stats.inClass}
          tone="red"
        />
        <StatCard
          icon={<KeyRound className="size-5" />}
          label="Đang mượn"
          value={stats.booked}
          tone="amber"
        />
      </section>

      <section aria-label="Chọn cơ sở" className="mt-6">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="size-4 text-primary" />
          Chọn cơ sở
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(CAMPUS_LABELS) as CampusFilter[]).map((item) => {
            const count =
              item === "all"
                ? views.length
                : views.filter((room) => room.campus === item).length;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setCampus(item);
                  setBuilding("all");
                }}
                className={[
                  "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all",
                  campus === item
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
                ].join(" ")}
              >
                <span className="block">{CAMPUS_LABELS[item]}</span>
                <span
                  className={
                    campus === item
                      ? "text-primary-foreground/75"
                      : "text-muted-foreground"
                  }
                >
                  {count} phòng
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Chọn khóa"
        className="mt-4 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="size-4 text-primary" />
          Xem lịch theo khóa
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(COHORT_LABELS) as CohortFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCohort(item)}
              className={[
                "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all",
                cohort === item
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
              ].join(" ")}
            >
              {COHORT_LABELS[item]}
            </button>
          ))}
        </div>
        {cohort === "K26" &&
          SHEET_CLASSES.every((item) => item.cohort !== "K26") && (
            <p className="mt-3 text-xs text-amber-700">
              Chưa có dữ liệu thời khóa biểu Khóa 26 trong Google Sheet hiện
              tại.
            </p>
          )}
      </section>

      <section
        aria-label="Chọn tòa nhà"
        className="mt-4 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="size-4 text-primary" />
          Chọn tòa
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <BuildingChip
              active={building === "all"}
              onClick={() => setBuilding("all")}
            >
              Tất cả tòa
            </BuildingChip>
          </div>
          {buildingGroups
            .filter((group) => campus === "all" || group.campus === campus)
            .map((group) => (
              <div
                key={group.campus}
                className="rounded-xl border border-border/70 bg-card/60 p-3"
              >
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.buildings.map((item) => (
                    <BuildingChip
                      key={item}
                      active={building === item}
                      onClick={() => setBuilding(item)}
                    >
                      {item === "HoiTruong"
                        ? "Hội trường"
                        : `Tòa ${buildingOrder(item)}`}
                    </BuildingChip>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* Bộ lọc trạng thái phòng */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ListFilter className="size-4" />
          Lọc:
        </span>
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          dot="bg-primary"
          count={stats.total}
        >
          Tất cả
        </FilterChip>
        <FilterChip
          active={filter === "available"}
          onClick={() => setFilter("available")}
          dot="bg-emerald-500"
          count={stats.available}
        >
          Phòng trống
        </FilterChip>
        <FilterChip
          active={filter === "in-class"}
          onClick={() => setFilter("in-class")}
          dot="bg-red-500"
          count={stats.inClass}
        >
          Đang có lớp
        </FilterChip>
        <FilterChip
          active={filter === "booked"}
          onClick={() => setFilter("booked")}
          dot="bg-amber-500"
          count={stats.booked}
        >
          Đang mượn
        </FilterChip>
      </div>

      <section aria-label="Lưới phòng học" className="mt-4">
        {visibleRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white/40 py-14 text-center">
            <DoorOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Không có phòng nào ở trạng thái này tại thời điểm hiện tại.
            </p>
          </div>
        ) : campus === "all" && building === "all" ? (
          <GroupedRoomGrid
            rooms={visibleRooms}
            onOpen={(id) => setActiveRoomId(id)}
            onCancel={handleCancelBooking}
          />
        ) : (
          <RoomGrid
            rooms={visibleRooms}
            onOpen={(id) => setActiveRoomId(id)}
            onCancel={handleCancelBooking}
          />
        )}
      </section>

      {activeRoom && activeRoom.status === "available" && (
        <BookingModal
          room={activeRoom}
          now={clock.slice(0, 5)}
          buffer={BUFFER_MINUTES}
          onClose={() => setActiveRoomId(null)}
          onConfirm={handleConfirmBooking}
        />
      )}
    </>
  );
}

const STAT_TONES = {
  navy: "text-primary bg-primary/10",
  green: "text-emerald-600 bg-emerald-500/10",
  red: "text-red-600 bg-red-500/10",
  amber: "text-amber-600 bg-amber-500/10",
} as const;

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: keyof typeof STAT_TONES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-[0_8px_30px_rgb(15,23,42,0.05)] backdrop-blur-xl">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${STAT_TONES[tone]}`}
      >
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-2xl font-bold tabular-nums text-foreground">
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  dot,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
      ].join(" ")}
    >
      <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
      {children}
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
}

function BuildingChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

const ROOM_STYLES: Record<
  RoomStatus,
  { card: string; badge: string; badgeText: string; dot: string }
> = {
  available: {
    card: "border-emerald-200 bg-emerald-50/80 hover:border-emerald-300 hover:shadow-emerald-500/10 cursor-pointer",
    badge: "bg-emerald-500/15 text-emerald-700",
    badgeText: "Trống",
    dot: "bg-emerald-500",
  },
  "in-class": {
    card: "border-red-200 bg-red-50/80",
    badge: "bg-red-500/15 text-red-700",
    badgeText: "Đang có lớp",
    dot: "bg-red-500",
  },
  booked: {
    card: "border-amber-200 bg-amber-50/80",
    badge: "bg-amber-500/15 text-amber-700",
    badgeText: "Đang mượn",
    dot: "bg-amber-500",
  },
};

function RoomGrid({
  rooms,
  onOpen,
  onCancel,
}: {
  rooms: RoomView[];
  onOpen: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 xl:grid-cols-5">
      {rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          onOpen={() => onOpen(room.id)}
          onCancel={() => onCancel(room.id)}
        />
      ))}
    </div>
  );
}

function GroupedRoomGrid({
  rooms,
  onOpen,
  onCancel,
}: {
  rooms: RoomView[];
  onOpen: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const campusGroups = [
    {
      campus: "36 Xuân La" as const,
      label: "Cơ sở 36 Xuân La",
      tone: "border-sky-200 bg-sky-50/70",
    },
    {
      campus: "371 Nguyễn Hoàng Tôn" as const,
      label: "Cơ sở 371 Nguyễn Hoàng Tôn",
      tone: "border-violet-200 bg-violet-50/70",
    },
  ];

  return (
    <div className="space-y-6">
      {campusGroups.map((group) => {
        const campusRooms = rooms.filter(
          (room) => room.campus === group.campus,
        );
        if (campusRooms.length === 0) return null;
        return (
          <section key={group.campus} aria-label={group.label}>
            <div
              className={`mb-3 flex items-center justify-between rounded-xl border px-4 py-3 ${group.tone}`}
            >
              <div>
                <h3 className="font-bold text-foreground">{group.label}</h3>
                <p className="text-xs text-muted-foreground">
                  Sắp xếp theo tòa và mã phòng
                </p>
              </div>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-foreground">
                {campusRooms.length} phòng
              </span>
            </div>
            <RoomGrid rooms={campusRooms} onOpen={onOpen} onCancel={onCancel} />
          </section>
        );
      })}
    </div>
  );
}

function RoomCard({
  room,
  onOpen,
  onCancel,
}: {
  room: RoomView;
  onOpen: () => void;
  onCancel: () => void;
}) {
  const style = ROOM_STYLES[room.status];
  const isAvailable = room.status === "available";

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xl font-bold text-foreground">{room.id}</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" />
            {room.capacity} chỗ
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {room.campus} · {room.building}
          </div>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.badge}`}
        >
          <span
            className={`size-1.5 rounded-full ${style.dot}`}
            aria-hidden="true"
          />
          {style.badgeText}
        </span>
      </div>

      <div className="mt-3 min-h-[42px] text-sm">
        {room.status === "available" && (
          <p className="font-medium text-emerald-700">
            {room.nextClass ? (
              <>
                Trống đến <span className="font-bold">{room.nextClass}</span>
              </>
            ) : (
              <>Trống đến hết ngày</>
            )}
          </p>
        )}
        {room.status === "in-class" && (
          <p className="text-red-700">
            <span className="line-clamp-1 font-semibold">{room.className}</span>
            <span className="text-xs text-red-600/80">
              đang học đến {room.classEnd}
            </span>
          </p>
        )}
        {room.status === "booked" && (
          <p className="text-amber-700">
            <span className="line-clamp-1 font-semibold">{room.borrower}</span>
            <span className="text-xs text-amber-600/90">
              mượn đến {room.bookedUntil}
            </span>
          </p>
        )}
      </div>

      {isAvailable && (
        <div className="mt-1 flex items-center justify-end text-xs font-semibold text-emerald-700 opacity-0 transition-opacity group-hover:opacity-100">
          Bấm để mượn phòng →
        </div>
      )}

      {room.status === "booked" && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
        >
          <Ban className="size-3.5" />
          Hủy mượn
        </button>
      )}
    </>
  );

  const baseClass =
    "group flex flex-col rounded-2xl border p-4 shadow-[0_6px_20px_rgb(15,23,42,0.05)] backdrop-blur-sm transition-all duration-200";

  if (isAvailable) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`${baseClass} ${style.card} text-left hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2`}
      >
        {content}
      </button>
    );
  }

  return <div className={`${baseClass} ${style.card}`}>{content}</div>;
}

function BookingModal({
  room,
  now,
  buffer,
  onClose,
  onConfirm,
}: {
  room: RoomView;
  now: string;
  buffer: number;
  onClose: () => void;
  onConfirm: (
    id: string,
    minutes: number,
    requester: string,
    requesterType: "Giảng viên" | "Sinh viên",
    purpose: string,
    size: number,
  ) => void;
}) {
  const nextClass = room.nextClass ?? END_OF_DAY;
  const gapMinutes = toMinutes(nextClass) - toMinutes(now);
  const usableMinutes = gapMinutes - buffer;
  const [selected, setSelected] = useState<number | null>(null);
  const [requester, setRequester] = useState("");
  const [requesterType, setRequesterType] = useState<
    "Giảng viên" | "Sinh viên"
  >("Giảng viên");
  const [purpose, setPurpose] = useState("");
  const [size, setSize] = useState(String(Math.min(room.capacity, 30)));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-2xl backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-primary px-5 py-4 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/15">
              <DoorOpen className="size-5" />
            </div>
            <div>
              <h2
                id="booking-title"
                className="text-lg font-bold leading-tight"
              >
                Mượn phòng {room.id}
              </h2>
              <p className="text-xs text-primary-foreground/80">
                Sức chứa {room.capacity} chỗ · bắt đầu lúc {now}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-primary-foreground/80 transition-colors hover:bg-white/15 hover:text-primary-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <p className="text-amber-800">
              Phòng <span className="font-bold">{room.id}</span> đang trống.{" "}
              {room.nextClass ? (
                <>
                  Lớp chính khóa tiếp theo bắt đầu lúc{" "}
                  <span className="font-bold">{room.nextClass}</span>.
                </>
              ) : (
                <>Không còn lớp chính khóa nào trong hôm nay.</>
              )}{" "}
              <span className="text-amber-700">
                (Bạn còn{" "}
                {gapMinutes > 0 ? formatDuration(gapMinutes) : "0 phút"} tính từ
                bây giờ.)
              </span>
            </p>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-foreground">
                Họ tên người đăng ký
                <input
                  value={requester}
                  onChange={(event) => setRequester(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal"
                  placeholder="Nhập họ tên"
                />
              </label>
              <label className="text-sm font-semibold text-foreground">
                Đối tượng
                <select
                  value={requesterType}
                  onChange={(event) =>
                    setRequesterType(
                      event.target.value as "Giảng viên" | "Sinh viên",
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal"
                >
                  <option>Giảng viên</option>
                  <option>Sinh viên</option>
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm font-semibold text-foreground">
              Mục đích mượn phòng
              <input
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal"
                placeholder="Ví dụ: học bù, họp nhóm, sinh hoạt CLB"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-foreground">
              Số người
              <input
                type="number"
                min="1"
                max={room.capacity}
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">
              Chọn thời gian mượn (tính từ hiện tại)
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {DURATION_OPTIONS.map((minutes) => {
                const locked = minutes > usableMinutes;
                const active = selected === minutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    disabled={locked}
                    onClick={() => setSelected(minutes)}
                    className={[
                      "relative flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-sm font-semibold transition-all",
                      locked
                        ? "cursor-not-allowed border-dashed border-border bg-muted text-muted-foreground/60"
                        : active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent",
                    ].join(" ")}
                  >
                    <span>{minutes} phút</span>
                    {locked && (
                      <span className="text-[10px] font-medium text-muted-foreground/70">
                        Khóa · trừ 15&apos; dọn phòng
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              Hệ thống tự động trừ{" "}
              <span className="font-semibold">15 phút buffer</span> để dọn phòng
              trước giờ lớp chính khóa.
            </p>
          </div>

          <button
            type="button"
            disabled={selected === null}
            onClick={() =>
              selected !== null &&
              onConfirm(
                room.id,
                selected,
                requester,
                requesterType,
                purpose,
                Math.min(room.capacity, Math.max(1, Number(size) || 1)),
              )
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <CheckCircle2 className="size-5" />
            Xác nhận mượn phòng ngay
          </button>
        </div>
      </div>
    </div>
  );
}
