import { AdminScheduler } from "@/components/admin-scheduler"
import { AuthGate } from "@/components/auth-gate"
import { PortalShell } from "@/components/portal-shell"

export default function AdminPage() {
  return (
    <AuthGate role="admin">
      <PortalShell role="admin"><AdminScheduler /></PortalShell>
    </AuthGate>
  )
}
