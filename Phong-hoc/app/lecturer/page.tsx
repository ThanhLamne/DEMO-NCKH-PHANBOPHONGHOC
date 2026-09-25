import { PortalShell } from "@/components/portal-shell"
import { RoomLookup } from "@/components/room-lookup"

export default function LecturerPage() {
  return (
    <PortalShell role="lecturer">
      <RoomLookup />
    </PortalShell>
  )
}