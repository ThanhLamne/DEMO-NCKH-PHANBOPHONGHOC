import { COURSE_CREDITS, COURSE_INFO_BY_NAME } from "./course-credits"
import { rangeTime, type ClassInfo } from "./scheduling"

export type CourseMeetingTimeline = {
  firstDate: string
  lastDate: string
  lastEndTime: string
  courseEndAt: string
}

const SEMESTER_STARTS: Record<NonNullable<ClassInfo["cohort"]>, [number, number, number]> = {
  K23: [2026, 7, 10],
  K24: [2026, 7, 10],
  K25: [2026, 7, 17],
  K26: [2026, 7, 31],
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

export function getCourseCredits(classInfo: ClassInfo): number | undefined {
  const code = classInfo.courseCode?.replace(/\s+/g, "")
  const byCode = code ? COURSE_CREDITS[code] : undefined
  return byCode ?? COURSE_INFO_BY_NAME[normalizedName(classInfo.name)]?.credits
}

function startPeriodFor(classInfo: ClassInfo): number {
  if (classInfo.startPeriod) return classInfo.startPeriod
  if (classInfo.endPeriod) return classInfo.endPeriod - classInfo.periods + 1
  if (classInfo.shift === "afternoon") return 6
  if (classInfo.shift === "evening") return 11
  return 1
}

function offeringKey(classInfo: ClassInfo): string {
  return JSON.stringify([
    classInfo.cohort ?? "",
    classInfo.className ?? classInfo.id,
    classInfo.section ?? "1",
    normalizedName(classInfo.name),
  ])
}

export function getCourseMeetingTimelines(
  classes: ClassInfo[],
): Map<string, CourseMeetingTimeline | null> {
  const groups = new Map<string, ClassInfo[]>()
  for (const classInfo of classes) {
    const key = offeringKey(classInfo)
    groups.set(key, [...(groups.get(key) ?? []), classInfo])
  }

  const timelines = new Map<string, CourseMeetingTimeline | null>()
  for (const offering of groups.values()) {
    const firstClass = offering[0]
    const cohort = firstClass.cohort
    const credits = getCourseCredits(firstClass)
    if (!cohort || !credits || credits <= 0) {
      for (const classInfo of offering) timelines.set(classInfo.id, null)
      continue
    }

    const semesterStart = new Date(...SEMESTER_STARTS[cohort])
    const sessions = [...offering].sort(
      (left, right) =>
        left.day - right.day || startPeriodFor(left) - startPeriodFor(right),
    )
    const sessionPeriods = sessions.map((classInfo) =>
      Math.max(1, classInfo.periods),
    )
    const weeklyPeriods = sessionPeriods.reduce((sum, periods) => sum + periods, 0)
    if (weeklyPeriods <= 0) {
      for (const classInfo of offering) timelines.set(classInfo.id, null)
      continue
    }

    const requiredPeriods = credits * 15
    const finalWeek = Math.floor((requiredPeriods - 1) / weeklyPeriods)
    const periodsInFinalWeek = requiredPeriods - finalWeek * weeklyPeriods
    let completedBeforeSession = 0
    const occurrences: Array<{
      classInfo: ClassInfo
      firstDate: string
      lastDate: string
      lastEndTime: string
    }> = []

    sessions.forEach((classInfo, index) => {
      const periods = sessionPeriods[index]
      const occursInFinalWeek = completedBeforeSession < periodsInFinalWeek
      const lastWeek = occursInFinalWeek ? finalWeek : finalWeek - 1
      if (lastWeek < 0) {
        timelines.set(classInfo.id, null)
        completedBeforeSession += periods
        return
      }

      const periodsAtLastMeeting = occursInFinalWeek
        ? Math.min(periods, periodsInFinalWeek - completedBeforeSession)
        : periods
      const startPeriod = startPeriodFor(classInfo)
      const lastEndPeriod = startPeriod + periodsAtLastMeeting - 1
      const firstDate = addDays(semesterStart, classInfo.day - 2)
      const lastDate = addDays(
        semesterStart,
        lastWeek * 7 + classInfo.day - 2,
      )
      const lastEndTime = rangeTime(startPeriod, lastEndPeriod).split(" - ")[1]
      occurrences.push({
        classInfo,
        firstDate: dateKey(firstDate),
        lastDate: dateKey(lastDate),
        lastEndTime,
      })
      completedBeforeSession += periods
    })

    const lastOccurrence = [...occurrences].sort((left, right) =>
        `${right.lastDate}T${right.lastEndTime}`.localeCompare(
          `${left.lastDate}T${left.lastEndTime}`,
        ),
      )[0]
    if (!lastOccurrence) {
      for (const classInfo of offering) timelines.set(classInfo.id, null)
      continue
    }

    const courseEndAt = `${lastOccurrence.lastDate}T${lastOccurrence.lastEndTime}`
    for (const occurrence of occurrences) {
      timelines.set(occurrence.classInfo.id, {
        firstDate: occurrence.firstDate,
        lastDate: occurrence.lastDate,
        lastEndTime: occurrence.lastEndTime,
        courseEndAt,
      })
    }
  }
  return timelines
}

export function isMeetingActiveOnDate(
  classInfo: ClassInfo,
  timeline: CourseMeetingTimeline | null | undefined,
  date: Date,
): boolean {
  if (timeline === null) return false
  const scheduleDay = date.getDay() + 1
  if (scheduleDay !== classInfo.day) return false
  if (!timeline) return true
  const key = dateKey(date)
  return key >= timeline.firstDate && key <= timeline.lastDate
}

export function meetingEndTimeOnDate(
  timeline: CourseMeetingTimeline | null | undefined,
  date: Date,
  scheduledEndTime: string,
): string {
  return timeline && dateKey(date) === timeline.lastDate
    ? timeline.lastEndTime
    : scheduledEndTime
}
