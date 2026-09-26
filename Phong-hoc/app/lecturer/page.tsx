import { PortalShell } from "@/components/portal-shell";
import { BorrowRequestForm } from "@/components/borrow-request-form";

export default function LecturerPage() {
  return (
    <PortalShell role="lecturer">
      <BorrowRequestForm requesterType="Giảng viên" />
    </PortalShell>
  );
}
