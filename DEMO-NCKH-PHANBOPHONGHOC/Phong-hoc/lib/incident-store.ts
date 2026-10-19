export type IncidentSeverity = "critical" | "medium" | "low"
export type IncidentStatus = "pending" | "in_progress" | "resolved"

export type MaintenanceInvoice = {
  invoiceNumber: string
  vendor: string
  maintenanceDate: string
  description: string
  quantity: number
  unitPrice: number
  laborCost: number
  notes: string
}

export type EquipmentIncident = {
  id: string
  roomId: string
  equipmentId: string
  equipmentName: string
  issueType: string
  severity: IncidentSeverity
  description: string
  reportedAt: string
  reportedBy: string
  status: IncidentStatus
  maintenanceInvoice?: MaintenanceInvoice
  photoDataUrl?: string
  isDemo?: boolean
}

export const INCIDENTS_STORAGE_KEY = "apag-equipment-incidents-v1"
export const INCIDENTS_UPDATED_EVENT = "apag-equipment-incidents-updated"

function isIncident(value: unknown): value is EquipmentIncident {
  if (!value || typeof value !== "object") return false
  const incident = value as Partial<EquipmentIncident>
  return typeof incident.id === "string" &&
    typeof incident.roomId === "string" &&
    typeof incident.equipmentName === "string" &&
    typeof incident.issueType === "string" &&
    (incident.severity === "critical" || incident.severity === "medium" || incident.severity === "low") &&
    (incident.status === "pending" || incident.status === "in_progress" || incident.status === "resolved") &&
    (incident.maintenanceInvoice === undefined ||
      (typeof incident.maintenanceInvoice === "object" &&
        typeof incident.maintenanceInvoice.invoiceNumber === "string" &&
        typeof incident.maintenanceInvoice.vendor === "string" &&
        typeof incident.maintenanceInvoice.description === "string" &&
        Number.isFinite(incident.maintenanceInvoice.quantity) &&
        Number.isFinite(incident.maintenanceInvoice.unitPrice) &&
        Number.isFinite(incident.maintenanceInvoice.laborCost)))
}

export function loadIncidents(): EquipmentIncident[] {
  if (typeof window === "undefined") return []
  const raw = window.localStorage.getItem(INCIDENTS_STORAGE_KEY)
  if (!raw) return []

  try {
    const incidents: unknown = JSON.parse(raw)
    return Array.isArray(incidents) ? incidents.filter(isIncident).filter((incident) => !incident.isDemo) : []
  } catch {
    window.localStorage.removeItem(INCIDENTS_STORAGE_KEY)
    return []
  }
}

export function saveIncidents(incidents: EquipmentIncident[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(INCIDENTS_STORAGE_KEY, JSON.stringify(incidents))
  window.dispatchEvent(new Event(INCIDENTS_UPDATED_EVENT))
}