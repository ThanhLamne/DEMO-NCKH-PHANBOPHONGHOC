import { PortalShell } from "@/components/portal-shell";
import { BorrowRequestForm } from "@/components/borrow-request-form";
import { AuthGate } from "@/components/auth-gate";

export default function LecturerPage() {
  return (
    <AuthGate role="lecturer">
      <PortalShell role="lecturer">
        <BorrowRequestForm requesterType="Giảng viên" />
      </PortalShell>
    </AuthGate>
  );
}
