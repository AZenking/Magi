import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { toast } from "sonner";
import { Button } from "@magi/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@magi/ui/components/card";
import { Badge } from "@magi/ui/components/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import { ZapIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon } from "lucide-react";

interface MatchResult {
  matched: number;
  unmatched: number;
  conflicts: number;
}

export const Route = createFileRoute("/dashboard/epg-matching")({
  component: EpgMatchingPage,
});

function EpgMatchingPage() {
  const queryClient = useQueryClient();
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");

  const { data: sourcesData, isLoading } = useQuery({
    queryKey: ["xmltv-sources"],
    queryFn: () =>
      apiClient<{ success: boolean; data: { items: SourceVo[] } }>("/sources", {
        params: { type: "xmltv", pageSize: 100 },
      }),
  });

  const xmltvSources = sourcesData?.data?.items ?? [];

  const matchMutation = useMutation({
    mutationFn: (sourceId: string) =>
      apiClient<{ success: boolean; data: MatchResult }>(`/epg/match/${sourceId}`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      const result = data.data;
      toast.success("EPG 匹配完成", {
        description: `匹配: ${result.matched} | 未匹配: ${result.unmatched} | 冲突: ${result.conflicts}`,
      });
      queryClient.invalidateQueries({ queryKey: ["xmltv-sources"] });
    },
    onError: (err) => {
      toast.error("EPG 匹配失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    },
  });

  const handleMatch = useCallback(() => {
    if (!selectedSourceId) {
      toast.error("请先选择一个 XMLTV 源");
      return;
    }
    matchMutation.mutate(selectedSourceId);
  }, [selectedSourceId, matchMutation]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">EPG 匹配</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>执行 EPG 匹配</CardTitle>
          <CardDescription>
            选择一个 XMLTV 源，将其频道数据与已有频道进行自动匹配。系统会根据 tvg-id、频道名称等多维度进行匹配。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-sm">
              <label className="text-sm font-medium mb-2 block">XMLTV 源</label>
              <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                <SelectTrigger aria-label="选择 XMLTV 源">
                  <SelectValue placeholder={isLoading ? "加载中..." : "选择 XMLTV 源"} />
                </SelectTrigger>
                <SelectContent>
                  {xmltvSources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleMatch}
              disabled={!selectedSourceId || matchMutation.isPending}
            >
              <ZapIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              {matchMutation.isPending ? "匹配中..." : "开始匹配"}
            </Button>
          </div>

          {matchMutation.data && (
            <div className="grid grid-cols-3 gap-4 mt-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" aria-hidden="true" />
                    <div>
                      <p className="text-2xl font-bold">{matchMutation.data.data.matched}</p>
                      <p className="text-sm text-muted-foreground">已匹配</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <XCircleIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-2xl font-bold">{matchMutation.data.data.unmatched}</p>
                      <p className="text-sm text-muted-foreground">未匹配</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <AlertTriangleIcon className="h-5 w-5 text-yellow-500" aria-hidden="true" />
                    <div>
                      <p className="text-2xl font-bold">{matchMutation.data.data.conflicts}</p>
                      <p className="text-sm text-muted-foreground">冲突</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>XMLTV 源列表</CardTitle>
        </CardHeader>
        <CardContent>
          {xmltvSources.length === 0 && !isLoading ? (
            <p className="text-sm text-muted-foreground">暂无 XMLTV 源。请先在 EPG 源管理中添加。</p>
          ) : (
            <div className="space-y-3">
              {xmltvSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">{source.name}</p>
                      <p className="text-sm text-muted-foreground truncate max-w-[400px]">{source.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={source.enabled ? "default" : "secondary"}>
                      {source.enabled ? "启用" : "禁用"}
                    </Badge>
                    {source.lastSyncStatus && (
                      <Badge variant={source.lastSyncStatus === "success" ? "default" : "destructive"}>
                        {source.lastSyncStatus === "success" ? "已同步" : "同步失败"}
                      </Badge>
                    )}
                    {source.lastSyncAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(source.lastSyncAt))}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSourceId(source.id);
                        matchMutation.mutate(source.id);
                      }}
                      disabled={matchMutation.isPending}
                    >
                      <ZapIcon className="mr-1 h-3 w-3" aria-hidden="true" />
                      匹配
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
