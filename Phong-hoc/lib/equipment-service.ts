import { loadEquipment, saveEquipment, type EquipmentItem, type EquipmentStatus } from "@/lib/equipment-store"

export interface EquipmentControlService {
  setPowerState(id: string, status: "active" | "off"): Promise<EquipmentItem>
}

export const localEquipmentControlService: EquipmentControlService = {
  async setPowerState(id, status) {
    const items = loadEquipment()
    const item = items.find((candidate) => candidate.id === id)
    if (!item || !item.controllable) {
      throw new Error("Thiết bị này không hỗ trợ điều khiển.")
    }

    const nextItem = { ...item, status, updatedAt: new Date().toISOString() }
    saveEquipment(items.map((candidate) => candidate.id === id ? nextItem : candidate))
    return nextItem
  },
}

export function isEquipmentStatus(value: unknown): value is EquipmentStatus {
  return value === "active" || value === "off" || value === "maintenance" || value === "broken" || value === "offline"
}