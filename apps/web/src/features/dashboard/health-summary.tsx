import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@magi/ui/components/card";
import { ActivityIcon } from "lucide-react";

interface HealthSummary {
  totalStreams: number;
  online: number;
  offline: number;
  degraded: number;
  unknown: number;
  avgResponseTime: number | null;
  totalChannels: number;
  activeChannels: number;
  degradedChannels: number;
  unavailableChannels: number;
}

export function HealthSummaryCards() {
  const { data } = useQuery({
    queryKey: ["health-summary"],
    queryFn: () => apiClient<{ success: boolean; data: HealthSummary }>("/dashboard/health-summary"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const h = data?.data;
  if (!h) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ActivityIcon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">流健康状态</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <HealthStat label="总流数" value={h.totalStreams} />
          <HealthStat label="在线" value={h.online} className="text-emerald-600" />
          <HealthStat label="离线" value={h.offline} className="text-red-600" />
          <HealthStat label="降级" value={h.degraded} className="text-amber-600" />
          <HealthStat label="未知" value={h.unknown} className="text-muted-foreground" />
          <HealthStat label="平均响应" value={h.avgResponseTime != null ? `${h.avgResponseTime}ms` : "-"} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 border-t pt-3">
          <HealthStat label="输出频道" value={h.totalChannels} />
          <HealthStat label="正常频道" value={h.activeChannels} className="text-emerald-600" />
          <HealthStat label="降级频道" value={h.degradedChannels} className="text-amber-600" />
          <HealthStat label="不可用频道" value={h.unavailableChannels} className="text-red-600" />
        </div>
      </CardContent>
    </Card>
  );
}

function HealthStat({ label, value, className = "" }: { label: string; value: string | number; className?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${className}`}>{value}</div>
    </div>
  );
}
