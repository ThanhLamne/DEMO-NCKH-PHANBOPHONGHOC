import { AdminScheduler } from "@/components/admin-scheduler"
import { PortalShell } from "@/components/portal-shell"
import { PortalAuth } from "@/components/portal-auth"

export const dynamic = "force-dynamic"

export default function AdminPage() {
  return (
    <PortalAuth role="admin">
      <PortalShell role="admin">
        <AdminScheduler />
      </PortalShell>
    </PortalAuth>
  )
}
