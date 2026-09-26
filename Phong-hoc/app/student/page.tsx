import { BorrowRequestForm } from "@/components/borrow-request-form"
import { PortalShell } from "@/components/portal-shell"

export default function StudentPage() {
  return (
    <PortalShell role="student">
      <BorrowRequestForm requesterType="Sinh viên" />
    </PortalShell>
  )
}
