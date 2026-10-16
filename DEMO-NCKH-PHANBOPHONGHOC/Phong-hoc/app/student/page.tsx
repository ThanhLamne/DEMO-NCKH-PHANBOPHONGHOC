import { BorrowRequestForm } from "@/components/borrow-request-form"
import { PortalShell } from "@/components/portal-shell"
import { PortalAuth } from "@/components/portal-auth"

export const dynamic = "force-dynamic"

export default function StudentPage() {
  return (
    <PortalAuth role="student">
      <PortalShell role="student">
        <BorrowRequestForm requesterType="Sinh viên" />
      </PortalShell>
    </PortalAuth>
  )
}
