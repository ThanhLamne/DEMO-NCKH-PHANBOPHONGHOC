import type { ClassInfo, ScheduleResult } from "./scheduling"

const STORAGE_KEY = "apag-allocation-snapshot-v1"
const IMPORTED_CLASSES_KEY = "apag-imported-classes-v1"
export const ALLOCATION_UPDATED_EVENT = "apag-allocation-updated"

export type AllocationSnapshot = {
  classes: ClassInfo[]
  result: ScheduleResult
}

export function saveAllocationSnapshot(snapshot: AllocationSnapshot): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  window.dispatchEvent(new Event(ALLOCATION_UPDATED_EVENT))
}

export function loadAllocationSnapshot(): AllocationSnapshot | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AllocationSnapshot
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function clearAllocationSnapshot(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(ALLOCATION_UPDATED_EVENT))
}

export function saveImportedClasses(classes: ClassInfo[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(IMPORTED_CLASSES_KEY, JSON.stringify(classes))
  window.dispatchEvent(new Event(ALLOCATION_UPDATED_EVENT))
}

export function loadImportedClasses(): ClassInfo[] | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(IMPORTED_CLASSES_KEY)
  if (!raw) return null
  try {
    const classes = JSON.parse(raw)
    return Array.isArray(classes) ? (classes as ClassInfo[]) : null
  } catch {
    window.localStorage.removeItem(IMPORTED_CLASSES_KEY)
    return null
  }
}

export function clearImportedClasses(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(IMPORTED_CLASSES_KEY)
}
