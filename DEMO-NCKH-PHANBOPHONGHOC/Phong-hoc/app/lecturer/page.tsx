import { PortalShell } from "@/components/portal-shell";
import { BorrowRequestForm } from "@/components/borrow-request-form";
import { PortalAuth } from "@/components/portal-auth";

export const dynamic = "force-dynamic";

export default function LecturerPage() {
  return (
    <PortalAuth role="lecturer">
      <PortalShell role="lecturer">
        <BorrowRequestForm requesterType="Giảng viên" />
      </PortalShell>
    </PortalAuth>
  );
}
