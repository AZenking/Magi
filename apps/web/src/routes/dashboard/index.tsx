import { createFileRoute } from "@tanstack/react-router";
import { SectionCards } from "@magi/ui/components/section-cards";
import { ChartAreaInteractive } from "@magi/ui/components/chart-area-interactive";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards />
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div>
      </div>
    </div>
  );
}
