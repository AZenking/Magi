import { createFileRoute } from "@tanstack/react-router";
import { ClientManagementPage } from "@/features/dashboard/account-clients/client-management-page";

export const Route = createFileRoute("/dashboard/account/clients/authorize")({
  // Kept as a compatibility URL for bookmarks; automatic registration means
  // there is no longer a user-entered authorization-code flow.
  component: ClientManagementPage,
});
