"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  DoorOpen,
  RefreshCw,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  loadAllocationSnapshot,
  ALLOCATION_UPDATED_EVENT,
  type AllocationSnapshot,
} from "@/lib/allocation-store";
import {
  BORROW_REQUESTS_UPDATED_EVENT,
  DEFAULT_BORROW_REQUESTS,
  getWeekKey,
  isBorrowRequestActiveAt,
  isBorrowRequestInWeek,
  loadBorrowRequests,
  saveBorrowRequests,
  type BorrowRequest,
} from "@/lib/borrow-store";
import {
  DAYS,
  DAY_LABELS,
  SHIFT_LABELS,
  SHIFT_PERIODS,
  SHIFTS,
  type Shift,
} from "@/lib/scheduling";
import { SHEET_ROOMS } from "@/lib/schedule-data";
import {
  getCourseMeetingTimelines,
  isMeetingActiveOnDate,
} from "@/lib/course-timing";

function periodsOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function dateForWeekDay(weekKey: string, day: number): Date {
  const date = new Date(`${weekKey}T00:00:00`);
  const mondayOffset = (1 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + mondayOffset + ((day + 5) % 7));
  return date;
}

function isRoomFree(
  roomId: string,
  day: number,
  shift: Shift,
  startPeriod: number,
  endPeriod: number,
  snapshot: AllocationSnapshot,
  requests: BorrowRequest[],
  targetDate: Date,
  classById: Map<string, AllocationSnapshot["classes"][number]>,
  timelines: ReturnType<typeof getCourseMeetingTimelines>,
  ignoreRequestId?: string,
): boolean {
  return (
    !snapshot.result.assignments.some((assignment) => {
      if (
        assignment.roomId !== roomId ||
        assignment.day !== day ||
        assignment.shift !== shift
      )
        return false;
      const classInfo = classById.get(assignment.classId);
      if (!classInfo) return true;
      if (
        !isMeetingActiveOnDate(
          classInfo,
          timelines.get(assignment.classId),
          targetDate,
        )
      )
        return false;
      return periodsOverlap(
        assignment.startPeriod,
        assignment.endPeriod,
        startPeriod,
        endPeriod,
      );
    }) &&
    !requests.some((request) => {
      if (
        request.id === ignoreRequestId ||
        request.status !== "approved" ||
        request.roomId !== roomId
      )
        return false;
      return (
        request.day === day &&
        request.shift === shift &&
        periodsOverlap(
          request.startPeriod,
          request.endPeriod,
          startPeriod,
          endPeriod,
        )
      );
    })
  );
}

export function BorrowRoomPanel() {
  const [snapshot, setSnapshot] = useState<AllocationSnapshot | null>(null);
  const [requests, setRequests] = useState<BorrowRequest[]>(
    DEFAULT_BORROW_REQUESTS,
  );
  const [selectedRooms, setSelectedRooms] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    const refresh = () => setSnapshot(loadAllocationSnapshot());
    refresh();
    window.addEventListener(ALLOCATION_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(ALLOCATION_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setRequests(loadBorrowRequests());
    refresh();
    window.addEventListener(BORROW_REQUESTS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(BORROW_REQUESTS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const activeRequests = requests.filter(
    (request) =>
      isBorrowRequestInWeek(request) &&
      (request.status !== "approved" || isBorrowRequestActiveAt(request)),
  );
  const classById = useMemo(
    () =>
      new Map(
        snapshot?.classes.map((classInfo) => [classInfo.id, classInfo]) ?? [],
      ),
    [snapshot],
  );
  const timelines = useMemo(
    () => getCourseMeetingTimelines(snapshot?.classes ?? []),
    [snapshot],
  );

  const pendingRequests = activeRequests.filter(
    (request) => request.status === "pending",
  );

  const roomsForRequest = (request: BorrowRequest) =>
    snapshot
      ? SHEET_ROOMS.filter(
          (room) =>
            room.capacity >= request.size &&
            isRoomFree(
              room.id,
              request.day,
              request.shift,
              request.startPeriod,
              request.endPeriod,
              snapshot,
              activeRequests,
              dateForWeekDay(request.weekKey, request.day),
              classById,
              timelines,
              request.id,
            ),
        )
      : [];

  const availability = useMemo(() => {
    if (!snapshot) return [];
    return DAYS.flatMap((day) =>
      SHIFTS.map((shift) => ({
        day,
        shift,
        rooms: SHEET_ROOMS.filter((room) =>
          isRoomFree(
            room.id,
            day,
            shift,
            SHIFT_PERIODS[shift][0],
            SHIFT_PERIODS[shift][SHIFT_PERIODS[shift].length - 1],
            snapshot,
            activeRequests,
            dateForWeekDay(getWeekKey(), day),
            classById,
            timelines,
          ),
        ),
      })),
    );
  }, [snapshot, activeRequests, classById, timelines]);

  function approveRequest(request: BorrowRequest) {
    const roomId = selectedRooms[request.id];
    if (
      !snapshot ||
      !roomId ||
      !roomsForRequest(request).some((room) => room.id === roomId)
    )
      return;

    saveBorrowRequests(
      requests.map((item) =>
        item.id === request.id ? { ...item, status: "approved", roomId } : item,
      ),
    );

    setSelectedRooms((current) => {
      const next = { ...current };
      delete next[request.id];
      return next;
    });
  }

  function rejectRequest(requestId: string) {
    saveBorrowRequests(
      requests.map((item) =>
        item.id === requestId ? { ...item, status: "rejected" } : item,
      ),
    );

    setSelectedRooms((current) => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {!snapshot && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <h2 className="text-lg font-bold text-amber-900">
                Chưa có lịch phân bổ để chọn phòng
              </h2>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Thông báo vẫn được tiếp nhận. Hãy phân bổ lịch trước để hệ thống
                đưa ra danh sách phòng phù hợp.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
              <Bell className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-sky-950">
                Thông báo đăng ký mượn phòng
              </h2>
              <p className="mt-1 text-sm text-sky-800">
                Yêu cầu từ giảng viên và sinh viên được tập trung tại đây để
                admin xử lý.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold text-sky-800">
            {pendingRequests.length} yêu cầu mới
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {pendingRequests.length === 0 ? (
            <p className="rounded-xl bg-white/70 px-3 py-3 text-sm text-muted-foreground">
              Không còn yêu cầu mượn phòng cần xử lý trong tuần này.
            </p>
          ) : (
            pendingRequests.map((request) => {
              const availableRooms = roomsForRequest(request);
              const selectedRoom = selectedRooms[request.id] ?? "";
              return (
                <article
                  key={request.id}
                  className="rounded-xl border border-sky-100 bg-white/80 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <UserRound className="size-4 text-sky-700" />
                        <h3 className="font-bold text-slate-800">
                          {request.requester}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {request.requesterType}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${request.status === "pending" ? "bg-amber-100 text-amber-700" : request.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                        >
                          {request.status === "pending"
                            ? "Chờ phê duyệt"
                            : request.status === "approved"
                              ? `Đã duyệt ${request.roomId}`
                              : "Đã từ chối"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        {request.courseName && (
                          <span>
                            {request.courseName}
                            {request.className
                              ? ` · ${request.className}`
                              : ""}{" "}
                            ·{" "}
                          </span>
                        )}
                        {request.purpose}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.borrowDate ? `${request.borrowDate} · ` : ""}
                        {DAY_LABELS[request.day]} · Ca{" "}
                        {SHIFT_LABELS[request.shift]} · Tiết{" "}
                        {request.startPeriod}–{request.endPeriod} ·{" "}
                        {request.size} người
                      </p>
                    </div>
                    {request.status === "pending" && (
                      <div className="flex flex-col gap-2 sm:min-w-[280px]">
                        <select
                          value={selectedRoom}
                          onChange={(event) =>
                            setSelectedRooms((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          disabled={!snapshot}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Chọn phòng để phê duyệt</option>
                          {availableRooms.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name} · {room.capacity} chỗ · {room.campus}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!snapshot || !selectedRoom}
                            onClick={() => approveRequest(request)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <CheckCircle2 className="size-3.5" /> Phê duyệt
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectRequest(request.id)}
                            className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                          >
                            <XCircle className="size-3.5" /> Từ chối
                          </button>
                        </div>
                        {availableRooms.length === 0 && (
                          <p className="text-xs font-semibold text-red-600">
                            {snapshot
                              ? "Không có phòng đủ chỗ trong khung thời gian này."
                              : "Chưa thể chọn phòng khi chưa có lịch phân bổ."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-emerald-950">
                Phòng còn trống để đăng ký mượn
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                Danh sách được tính từ lịch đã chốt và tự cập nhật khi admin
                thêm lớp phát sinh.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
            {snapshot && snapshot.result
              ? snapshot.result.assignments.length
              : 0}{" "}
            lớp đã cố định
          </span>
        </div>
      </section>

      {snapshot &&
        availability.map(({ day, shift, rooms }) => (
          <section
            key={`${day}-${shift}`}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                <h3 className="font-bold text-foreground">
                  {DAY_LABELS[day]} · Ca {SHIFT_LABELS[shift]}
                </h3>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                {rooms.length} phòng trống
              </span>
            </div>
            {rooms.length === 0 ? (
              <p className="rounded-xl bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
                Không còn phòng trống trong khung này.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {rooms.map((room) => (
                  <div
                    key={`${day}-${shift}-${room.id}`}
                    className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                        <DoorOpen className="size-4" />
                        {room.name}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700">
                        {room.capacity} chỗ
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-emerald-800">
                      {room.campus} · {room.building}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                      Có thể tiếp nhận đăng ký
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className="size-3.5" />
        Dữ liệu được làm mới ngay sau mỗi lần phân bổ hoặc thêm lớp.
      </div>
    </div>
  );
}
