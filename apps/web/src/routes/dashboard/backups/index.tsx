import { createFileRoute } from "@tanstack/react-router";
import { BackupListPage } from "@/features/dashboard/backups/backup-list-page";

export const Route = createFileRoute("/dashboard/backups/")({
  component: BackupsPage,
});

function BackupsPage() {
  return <BackupListPage />;
}
