"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Users,
} from "lucide-react";
import {
  ALLOCATION_UPDATED_EVENT,
  loadAllocationSnapshot,
  saveAllocationSnapshot,
  type AllocationSnapshot,
} from "@/lib/allocation-store";
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  isBorrowRequestInWeek,
  loadBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store";
import {
  DAY_LABELS,
  DAYS,
  rangeTime,
  SHIFT_LABELS,
  SHIFT_PERIODS,
  SHIFTS,
  type Shift,
  releaseRoomAssignments,
} from "@/lib/scheduling";
import { SHEET_ROOMS } from "@/lib/schedule-data";

function getDefaultDay(): number {
  const today = new Date().getDay() + 1;
  return DAYS.includes(today as (typeof DAYS)[number]) ? today : DAYS[0];
}

export function RoomManagementPanel() {
  const [snapshot, setSnapshot] = useState<AllocationSnapshot | null>(null);
  const [hasLoadedAllocation, setHasLoadedAllocation] = useState(false);
  const [requests, setRequests] = useState<BorrowRequest[]>([]);
  const [selectedDay, setSelectedDay] = useState(getDefaultDay);
  const [selectedShift, setSelectedShift] = useState<Shift>("morning");

  useEffect(() => {
    const refreshAllocation = () => {
      setSnapshot(loadAllocationSnapshot());
      setHasLoadedAllocation(true);
    };
    const refreshRequests = () => setRequests(loadBorrowRequests());

    refreshAllocation();
    refreshRequests();
    window.addEventListener(ALLOCATION_UPDATED_EVENT, refreshAllocation);
    window.addEventListener(BORROW_REQUESTS_UPDATED_EVENT, refreshRequests);
    window.addEventListener("storage", refreshAllocation);
    window.addEventListener("storage", refreshRequests);
    return () => {
      window.removeEventListener(ALLOCATION_UPDATED_EVENT, refreshAllocation);
      window.removeEventListener(BORROW_REQUESTS_UPDATED_EVENT, refreshRequests);
      window.removeEventListener("storage", refreshAllocation);
      window.removeEventListener("storage", refreshRequests);
    };
  }, []);

  const roomRows = useMemo(() => {
    const classById = new Map(
      snapshot?.classes.map((classInfo) => [classInfo.id, classInfo]) ?? [],
    );
    const assignments = (snapshot?.result.assignments ?? []).filter(
      (assignment) =>
        assignment.day === selectedDay && assignment.shift === selectedShift,
    );
    const approvedBorrowings = requests.filter(
      (request) =>
        request.status === "approved" &&
        Boolean(request.roomId) &&
        request.day === selectedDay &&
        request.shift === selectedShift &&
        isBorrowRequestInWeek(request),
    );

    return SHEET_ROOMS.map((room) => ({
      room,
      classes: assignments
        .filter((assignment) => assignment.roomId === room.id)
        .map((assignment) => ({
          assignment,
          classInfo: classById.get(assignment.classId),
        })),
      borrowings: approvedBorrowings.filter(
        (request) => request.roomId === room.id,
      ),
    })).sort((a, b) =>
      a.room.name.localeCompare(b.room.name, "vi", { numeric: true }),
    );
  }, [requests, selectedDay, selectedShift, snapshot]);

  const assignedRooms = roomRows.filter(
    (row) => row.classes.length > 0 || row.borrowings.length > 0,
  );
  const freeRooms = roomRows.filter(
    (row) => row.classes.length === 0 && row.borrowings.length === 0,
  );

  function handleReleaseRoom(roomId: string, classCount: number) {
    if (!snapshot) return;
    const message =
      classCount === 1
        ? `Gỡ lịch lớp khỏi phòng ${roomId} vào ${DAY_LABELS[selectedDay]}, ca ${SHIFT_LABELS[selectedShift]}? Lớp sẽ chuyển về trạng thái chưa xếp.`
        : `Gỡ ${classCount} lịch lớp khỏi phòng ${roomId} vào ${DAY_LABELS[selectedDay]}, ca ${SHIFT_LABELS[selectedShift]}? Các lớp sẽ chuyển về trạng thái chưa xếp.`;
    if (!window.confirm(message)) return;

    const result = releaseRoomAssignments(
      roomId,
      selectedDay,
      selectedShift,
      snapshot.classes,
      SHEET_ROOMS,
      snapshot.result,
    );
    saveAllocationSnapshot({ ...snapshot, result });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Building2 className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-emerald-950">
              Quản lý phòng học
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              Xem phòng đã xếp lịch và phòng còn trống theo ngày, ca học.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">
              Thứ
              <select
                value={selectedDay}
                onChange={(event) => setSelectedDay(Number(event.target.value))}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {DAY_LABELS[day]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Ca học
              <select
                value={selectedShift}
                onChange={(event) =>
                  setSelectedShift(event.target.value as Shift)
                }
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              >
                {SHIFTS.map((shift) => (
                  <option key={shift} value={shift}>
                    {SHIFT_LABELS[shift]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {!hasLoadedAllocation ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Đang tải lịch phân bổ phòng...
        </p>
      ) : !snapshot ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          Chưa có lịch phân bổ đã lưu. Hãy chạy “Sắp xếp tự động” trong mục
          Phân bổ phòng học để xem phòng đã xếp và phòng trống tại đây.
        </p>
      ) : (
        <>
          <section
            className="grid gap-3 sm:grid-cols-3"
            aria-label="Tổng quan phòng"
          >
            <SummaryCard
              icon={<Building2 className="size-5" />}
              label="Tổng số phòng"
              value={roomRows.length}
              tone="slate"
            />
            <SummaryCard
              icon={<CheckCircle2 className="size-5" />}
              label="Phòng đã xếp / mượn"
              value={assignedRooms.length}
              tone="amber"
            />
            <SummaryCard
              icon={<DoorOpen className="size-5" />}
              label="Phòng trống cả ca"
              value={freeRooms.length}
              tone="emerald"
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <CheckCircle2 className="size-5 text-amber-600" />
                  Phòng đã xếp ({assignedRooms.length})
                </h3>
                <span className="text-xs text-slate-500">
                  {DAY_LABELS[selectedDay]} · Ca {SHIFT_LABELS[selectedShift]}
                </span>
              </div>
              {assignedRooms.length === 0 ? (
                <EmptyMessage>
                  Chưa có lớp hoặc lượt mượn nào được xếp trong khung này.
                </EmptyMessage>
              ) : (
                <div className="space-y-3">
                  {assignedRooms.map(({ room, classes, borrowings }) => (
                    <article
                      key={room.id}
                      className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900">
                            Phòng {room.name}
                          </h4>
                          <p className="mt-1 text-xs text-slate-500">
                            {room.campus ?? "Chưa rõ cơ sở"} ·{" "}
                            {room.building ?? "Chưa rõ tòa"} · {room.capacity}{" "}
                            chỗ
                          </p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                          Đã xếp
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {classes.map(({ assignment, classInfo }) => (
                          <p
                            key={`${assignment.classId}-${assignment.startPeriod}`}
                            className="flex items-start gap-2 text-sm text-slate-700"
                          >
                            <CalendarDays className="mt-0.5 size-4 shrink-0 text-slate-400" />
                            <span>
                              <strong>{classInfo?.name ?? "Lớp học"}</strong>
                              {" · "}Tiết {assignment.startPeriod}–
                              {assignment.endPeriod} ·{" "}
                              {rangeTime(
                                assignment.startPeriod,
                                assignment.endPeriod,
                              )}
                              {classInfo
                                ? ` · Sĩ số ${classInfo.size}`
                                : ""}
                            </span>
                          </p>
                        ))}
                        {borrowings.map((request) => (
                          <p
                            key={request.id}
                            className="flex items-start gap-2 text-sm text-slate-700"
                          >
                            <Users className="mt-0.5 size-4 shrink-0 text-slate-400" />
                            <span>
                              <strong>
                                {request.courseName || request.purpose}
                              </strong>
                              {" · "}Tiết {request.startPeriod}–
                              {request.endPeriod}
                              {" · "}{request.requester} · Đã duyệt
                            </span>
                          </p>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <p className="text-xs text-slate-500">
                          {borrowings.length > 0
                            ? "Có lượt mượn đã duyệt trong ca; không thể giải phóng phòng."
                            : "Gỡ lịch sẽ chuyển các lớp trong phòng về danh sách chưa xếp."}
                        </p>
                        <button
                          type="button"
                          disabled={borrowings.length > 0 || classes.length === 0}
                          onClick={() =>
                            handleReleaseRoom(room.id, classes.length)
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <DoorOpen className="size-4" />
                          Giải phóng phòng
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <DoorOpen className="size-5 text-emerald-600" />
                  Phòng trống cả ca ({freeRooms.length})
                </h3>
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock3 className="size-3.5" />
                  Ca {SHIFT_LABELS[selectedShift]}
                </span>
              </div>
              {freeRooms.length === 0 ? (
                <EmptyMessage>
                  Không còn phòng trống trong ngày và ca đã chọn.
                </EmptyMessage>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {freeRooms.map(({ room }) => (
                    <article
                      key={room.id}
                      className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-emerald-950">
                          Phòng {room.name}
                        </h4>
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-emerald-800">
                          {room.capacity} chỗ
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-emerald-800">
                        {room.campus ?? "Chưa rõ cơ sở"} ·{" "}
                        {room.building ?? "Chưa rõ tòa"}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-emerald-700">
                        Trống cả ca {SHIFT_LABELS[selectedShift]}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "slate" | "amber" | "emerald";
}) {
  const styles = {
    slate: "border-slate-200 bg-white text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };

  return (
    <article className={`flex items-center gap-3 rounded-xl border p-4 ${styles[tone]}`}>
      <span>{icon}</span>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs font-semibold">{label}</p>
      </div>
    </article>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}
