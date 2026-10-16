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

const DEMO_EQUIPMENT: EquipmentItem[] = [
  { id: "demo-a301-light-1", name: "Đèn 1", category: "Chiếu sáng", roomId: "A301", quantity: 1, status: "active", controllable: true, notes: "Thiết bị minh họa", updatedAt: "", isDemo: true },
  { id: "demo-a301-light-2", name: "Đèn 2", category: "Chiếu sáng", roomId: "A301", quantity: 1, status: "off", controllable: true, notes: "Thiết bị minh họa", updatedAt: "", isDemo: true },
  { id: "demo-a301-fan-1", name: "Quạt 1", category: "Quạt", roomId: "A301", quantity: 1, status: "active", controllable: true, notes: "Thiết bị minh họa", updatedAt: "", isDemo: true },
  { id: "demo-a301-projector", name: "Máy chiếu", category: "Máy chiếu", roomId: "A301", quantity: 1, status: "active", controllable: false, notes: "Thiết bị minh họa", updatedAt: "", isDemo: true },
]

export function loadEquipment(): EquipmentItem[] {
  if (typeof window === "undefined") return []
  const raw = window.localStorage.getItem(EQUIPMENT_STORAGE_KEY)
  if (!raw) return DEMO_EQUIPMENT

  try {
    const items: unknown = JSON.parse(raw)
    if (!Array.isArray(items)) return []

    return items.map((item, index) => {
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
  } catch {
    window.localStorage.removeItem(EQUIPMENT_STORAGE_KEY)
    return DEMO_EQUIPMENT
  }
}

export function saveEquipment(items: EquipmentItem[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(EQUIPMENT_UPDATED_EVENT))
}