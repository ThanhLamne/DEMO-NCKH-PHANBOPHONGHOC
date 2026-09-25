import { AdminScheduler } from "@/components/admin-scheduler"
import { PortalShell } from "@/components/portal-shell"

export default function AdminPage() {
  return <PortalShell role="admin"><AdminScheduler /></PortalShell>
}
