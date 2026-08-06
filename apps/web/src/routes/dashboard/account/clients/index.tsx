import { createFileRoute } from "@tanstack/react-router";
import { ClientManagementPage } from "@/features/dashboard/account-clients/client-management-page";

export const Route = createFileRoute("/dashboard/account/clients/")({
  component: ClientManagementPage,
});
