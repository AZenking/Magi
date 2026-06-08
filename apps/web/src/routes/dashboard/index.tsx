import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@magi/ui/components/card";
import { Radio, LinkIcon, Tv, CalendarDays, CheckCircle2, Circle, ArrowRight, ActivityIcon } from "lucide-react";
import { HealthSummaryCards } from "@/features/dashboard/health-summary";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: sourceData } = useQuery({
    queryKey: ["dashboard-sources"],
    queryFn: () =>
      apiClient<{ success: boolean; data: { m3u: number; xmltv: number; channels: number; programmes: number; synced: number } }>(
        "/dashboard/stats",
      ),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const stats = sourceData?.data;

  const steps = [
    {
      icon: Radio,
      title: "添加 & 同步源",
      desc: "添加 M3U 和 XMLTV 源，同步频道与节目数据",
      to: "/dashboard/sources/m3u" as const,
      done: (stats?.m3u ?? 0) > 0 && (stats?.xmltv ?? 0) > 0,
    },
    {
      icon: LinkIcon,
      title: "EPG 匹配",
      desc: "将频道与 XMLTV 节目单自动匹配",
      to: "/dashboard/epg-matching" as const,
      done: (stats?.synced ?? 0) > 0,
    },
    {
      icon: Tv,
      title: "频道管理",
      desc: "查看匹配结果，管理频道输出列表",
      to: "/dashboard/channels" as const,
      done: false,
    },
    {
      icon: CalendarDays,
      title: "节目单",
      desc: "浏览各频道的节目时间表",
      to: "/dashboard/sources/programmes" as const,
      done: false,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 py-4 md:py-6">
      <div className="px-4 lg:px-6">
        <h1 className="text-2xl font-bold tracking-tight">工作台</h1>
        <p className="text-muted-foreground text-sm mt-1">
          按以下步骤完成 EPG 数据的导入与匹配
        </p>
      </div>

      {/* Step guide */}
      <div className="px-4 lg:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, i) => (
            <Link key={step.title} to={step.to}>
              <Card className="relative h-full transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      {step.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </div>
                    <step.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base mt-2">{step.title}</CardTitle>
                  <CardDescription className="text-xs">{step.desc}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                    前往 <ArrowRight className="h-3 w-3" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Flow diagram */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">数据流程</CardTitle>
            <CardDescription>从源同步到 EPG 输出的完整链路</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 text-sm">
              {/* M3U line */}
              <div className="flex flex-wrap items-center gap-2">
                <FlowNode label="M3U 源" active={(stats?.m3u ?? 0) > 0} />
                <FlowArrow />
                <FlowNode label="原始频道" sub="raw_m3u_channels" />
                <FlowArrow />
                <FlowNode label="频道表" sub="channels" />
                <FlowArrow label="EPG 匹配" highlight />
                <FlowNode label="规范频道" sub="canonical_channels" active={stats?.synced !== undefined && stats.synced > 0} />
                <FlowArrow label="输出" />
                <FlowNode label="M3U/XMLTV" />
              </div>
              {/* XMLTV line — feeds into EPG matching */}
              <div className="flex flex-wrap items-center gap-2">
                <FlowNode label="XMLTV 源" active={(stats?.xmltv ?? 0) > 0} />
                <FlowArrow />
                <FlowNode label="XMLTV 频道" sub="raw_xmltv_channels" />
                <FlowArrow />
                <FlowNode label="节目单" sub="programmes" />
                <span className="text-xs text-muted-foreground ml-1">→ 通过 epgChannelId 关联至规范频道</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 px-4 lg:px-6 sm:grid-cols-4">
        <StatCard label="M3U 源" value={stats?.m3u ?? "-"} />
        <StatCard label="XMLTV 源" value={stats?.xmltv ?? "-"} />
        <StatCard label="频道" value={stats?.channels ?? "-"} />
        <StatCard label="节目" value={stats?.programmes ?? "-"} />
      </div>

      {/* Health summary */}
      <div className="px-4 lg:px-6">
        <HealthSummaryCards />
      </div>
    </div>
  );
}

function FlowNode({ label, sub, active }: { label: string; sub?: string; active?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center ${
        active ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="font-medium text-sm">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function FlowArrow({ label, highlight }: { label?: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <ArrowRight className={`h-4 w-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
      {label && (
        <span className={`text-[10px] ${highlight ? "text-primary font-medium" : "text-muted-foreground"}`}>
          {label}
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
