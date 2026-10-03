import { BorrowRequestForm } from "@/components/borrow-request-form"
import { PortalShell } from "@/components/portal-shell"
import { AuthGate } from "@/components/auth-gate"

export default function StudentPage() {
  return (
    <AuthGate role="student">
      <PortalShell role="student">
        <BorrowRequestForm requesterType="Sinh viên" />
      </PortalShell>
    </AuthGate>
  )
}
