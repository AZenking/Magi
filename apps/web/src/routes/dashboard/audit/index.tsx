import { createFileRoute } from "@tanstack/react-router";
import { AuditList } from "@/features/dashboard/audit/audit-list";

export const Route = createFileRoute("/dashboard/audit/")({
  component: AuditPage,
});

function AuditPage() {
  return <AuditList />;
}
