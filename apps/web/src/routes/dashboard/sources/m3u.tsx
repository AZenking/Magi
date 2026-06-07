import { createFileRoute } from "@tanstack/react-router";
import { SourceListPage } from "@/features/dashboard/sources/source-list-page";

export const Route = createFileRoute("/dashboard/sources/m3u")({
  component: M3uSourcesPage,
});

function M3uSourcesPage() {
  return <SourceListPage type="m3u" title="M3U 源" />;
}
