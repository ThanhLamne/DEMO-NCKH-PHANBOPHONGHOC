import { SHEET_ROOMS } from "@/lib/schedule-data"

export type EquipmentStatus = "active" | "off" | "maintenance" | "broken" | "offline"

export type EquipmentItem = {
  id: string
  name: string
  category: string
  roomId: string
  quantity: number
  status: EquipmentStatus
  controllable: boolean
  notes: string
  updatedAt: string
  isDemo?: boolean
}

export const EQUIPMENT_STORAGE_KEY = "apag-equipment-v1"
export const EQUIPMENT_UPDATED_EVENT = "apag-equipment-updated"

const ROOM_EQUIPMENT = [
  { suffix: "air-conditioner", name: "Điều hòa", category: "Điều hòa", quantity: 2 },
  { suffix: "projector", name: "Máy chiếu", category: "Máy chiếu", quantity: 1 },
  { suffix: "ceiling-fan", name: "Quạt trần", category: "Quạt trần", quantity: 4 },
] as const

function normalizeEquipmentText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLocaleLowerCase()
}

function matchesStandardEquipment(item: EquipmentItem, suffix: string): boolean {
  const normalized = normalizeEquipmentText(`${item.name} ${item.category}`)
  if (suffix === "air-conditioner") {
    return normalized.includes("dieu hoa") || normalized.includes("may lanh")
  }
  if (suffix === "projector") return normalized.includes("may chieu")
  return normalized.includes("quat")
}

function withRoomEquipmentDefaults(items: EquipmentItem[]): EquipmentItem[] {
  const next = [...items]

  for (const room of SHEET_ROOMS) {
    for (const standard of ROOM_EQUIPMENT) {
      const existing = next.find(
        (item) =>
          item.roomId === room.id &&
          matchesStandardEquipment(item, standard.suffix),
      )
      if (existing) {
        if (existing.quantity !== standard.quantity) {
          next[next.indexOf(existing)] = {
            ...existing,
            quantity: standard.quantity,
          }
        }
        continue
      }

      next.push({
        id: `standard-${room.id}-${standard.suffix}`,
        name: standard.name,
        category: standard.category,
        roomId: room.id,
        quantity: standard.quantity,
        status: "active",
        controllable: false,
        notes: "Thiết bị tiêu chuẩn của phòng",
        updatedAt: "",
      })
    }
  }
  return next
}

export function loadEquipment(): EquipmentItem[] {
  if (typeof window === "undefined") return []
  const raw = window.localStorage.getItem(EQUIPMENT_STORAGE_KEY)
  if (!raw) {
    const defaults = withRoomEquipmentDefaults([])
    window.localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(defaults))
    return defaults
  }

  try {
    const items: unknown = JSON.parse(raw)
    if (!Array.isArray(items)) {
      const defaults = withRoomEquipmentDefaults([])
      window.localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }

    const normalizedItems = items.map((item, index) => {
      const legacy = item as Partial<EquipmentItem> & { condition?: string }
      const status: EquipmentStatus =
        legacy.status === "active" || legacy.status === "off" || legacy.status === "maintenance" || legacy.status === "broken" || legacy.status === "offline"
          ? legacy.status
          : legacy.condition === "maintenance" || legacy.condition === "broken"
            ? legacy.condition
            : "active"

      return {
        id: typeof legacy.id === "string" ? legacy.id : `equipment-migrated-${index}`,
        name: typeof legacy.name === "string" ? legacy.name : "Thiết bị chưa đặt tên",
        category: typeof legacy.category === "string" ? legacy.category : "Khác",
        roomId: typeof legacy.roomId === "string" ? legacy.roomId : "",
        quantity: Number.isInteger(legacy.quantity) && Number(legacy.quantity) > 0 ? Number(legacy.quantity) : 1,
        status: legacy.isDemo && legacy.id === "demo-a301-projector" && !legacy.updatedAt ? "active" : status,
        controllable: Boolean(legacy.controllable),
        notes: typeof legacy.notes === "string" ? legacy.notes : "",
        updatedAt: typeof legacy.updatedAt === "string" ? legacy.updatedAt : "",
        isDemo: Boolean(legacy.isDemo),
      }
    })
    const itemsWithDefaults = withRoomEquipmentDefaults(normalizedItems)
    if (itemsWithDefaults.length !== normalizedItems.length ||
      itemsWithDefaults.some((item, index) => item.quantity !== normalizedItems[index]?.quantity)) {
      window.localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(itemsWithDefaults))
    }
    return itemsWithDefaults
  } catch {
    const defaults = withRoomEquipmentDefaults([])
    window.localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(defaults))
    return defaults
  }
}

export function saveEquipment(items: EquipmentItem[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(EQUIPMENT_UPDATED_EVENT))
}