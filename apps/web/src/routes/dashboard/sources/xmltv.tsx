import { createFileRoute } from "@tanstack/react-router";
import { SourceListPage } from "@/features/dashboard/sources/source-list-page";

export const Route = createFileRoute("/dashboard/sources/xmltv")({
  component: XmltvSourcesPage,
});

function XmltvSourcesPage() {
  return <SourceListPage type="xmltv" title="EPG/XMLTV 源" />;
}
