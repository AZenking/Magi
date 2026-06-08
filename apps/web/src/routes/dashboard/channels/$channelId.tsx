import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OutputChannelDetailVo, ChannelStreamVo, PaginatedResponse, ProgrammeVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { LogoUpload } from "@/features/dashboard/channels/logo-upload";
import { Button } from "@magi/ui/components/button";
import { Badge } from "@magi/ui/components/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@magi/ui/components/alert-dialog";
import { ArrowLeftIcon, PlusIcon, TrashIcon, StarIcon, LinkIcon, PencilIcon } from "lucide-react";
import { OutputChannelFormDialog } from "@/features/dashboard/channels/channel-form-dialog";
import { EpgMatchDialog } from "@/features/dashboard/channels/epg-match-dialog";
import { ChannelStreamDialog } from "@/features/dashboard/channels/channel-stream-dialog";

export const Route = createFileRoute("/dashboard/channels/$channelId")({
  component: ChannelDetailPage,
});

const epgStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  matched_auto: { label: "自动匹配", variant: "default" },
  matched_manual: { label: "手动匹配", variant: "secondary" },
  unmatched: { label: "未匹配", variant: "outline" },
  conflict: { label: "冲突", variant: "destructive" },
};

const healthStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  online: { label: "在线", variant: "default" },
  offline: { label: "离线", variant: "destructive" },
  degraded: { label: "降级", variant: "secondary" },
  unknown: { label: "未知", variant: "outline" },
};

function ChannelDetailPage() {
  const channelId = Route.useParams().channelId;
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [epgOpen, setEpgOpen] = useState(false);
  const [streamDialogOpen, setStreamDialogOpen] = useState(false);
  const [editingStream, setEditingStream] = useState<ChannelStreamVo | null>(null);
  const [confirmDeleteStreamId, setConfirmDeleteStreamId] = useState<string | null>(null);

  // Channel detail
  const { data: detail, isLoading } = useQuery({
    queryKey: ["output-channel-detail", channelId],
    queryFn: () =>
      apiClient<{ success: boolean; data: OutputChannelDetailVo }>(`/output/channels/${channelId}`),
  });

  const channel = detail?.data?.channel;
  const streams = detail?.data?.streams ?? [];

  // Programmes (only if EPG bound)
  const [progPage] = useState(1);
  const { data: progData } = useQuery({
    queryKey: ["programmes", channel?.epgChannelId, progPage],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<ProgrammeVo> }>("/programmes", {
        params: { xmltvChannelId: channel!.epgChannelId ?? undefined, page: progPage, pageSize: 10 },
      }),
    enabled: !!channel?.epgChannelId,
  });

  const programmes = progData?.data?.items ?? [];

  // Update channel mutation (with error toast)
  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiClient(`/output/channels/${channelId}`, { method: "PUT", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["output-channel-detail", channelId] });
      queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    },
    onError: (err) => {
      toast.error("保存失败", { description: err.message });
    },
  });

  // Stream CRUD mutations
  const createStreamMutation = useMutation({
    mutationFn: async (data: { streamUrl: string; m3uSourceId?: string | null; sourceChannelId?: string | null }) =>
      apiClient(`/output/channels/${channelId}/streams`, { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["output-channel-detail", channelId] });
      queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    },
    onError: (err) => {
      toast.error("新增播放源失败", { description: err.message });
    },
  });

  const updateStreamMutation = useMutation({
    mutationFn: async ({ streamId, data }: { streamId: string; data: { streamUrl?: string; m3uSourceId?: string | null; sourceChannelId?: string | null } }) =>
      apiClient(`/output/channels/${channelId}/streams/${streamId}`, { method: "PUT", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["output-channel-detail", channelId] });
      queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    },
    onError: (err) => {
      toast.error("更新播放源失败", { description: err.message });
    },
  });

  const deleteStreamMutation = useMutation({
    mutationFn: async (streamId: string) =>
      apiClient(`/output/channels/${channelId}/streams/${streamId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["output-channel-detail", channelId] });
      queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    },
    onError: (err) => {
      toast.error("删除失败", { description: err.message });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (streamId: string) =>
      apiClient(`/output/channels/${channelId}/streams/${streamId}/primary`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["output-channel-detail", channelId] });
      queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    },
    onError: (err) => {
      toast.error("设为主源失败", { description: err.message });
    },
  });

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">加载中…</div>
    );
  }

  if (!channel) {
    return (
      <div className="py-8 text-center text-muted-foreground">频道不存在</div>
    );
  }

  const epgBadge = epgStatusMap[channel.epgStatus] ?? { label: channel.epgStatus, variant: "outline" as const };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard/channels">
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <LogoUpload
              currentLogo={channel.standardLogo}
              channelId={channel.id}
              onLogoChange={(url) => queryClient.invalidateQueries({ queryKey: ["output-channel-detail", channelId] })}
            />
            <div>
              <h1 className="text-xl font-bold">{channel.standardName}</h1>
              {channel.standardGroup && (
                <p className="text-sm text-muted-foreground">{channel.standardGroup}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant={epgBadge.variant}>{epgBadge.label}</Badge>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              编辑
            </Button>
          </div>
        </div>

        {/* EPG Section */}
        <section className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">EPG 匹配</h2>
            <Button variant="outline" size="sm" onClick={() => setEpgOpen(true)}>
              修改绑定
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">频道 ID (tvg-id)</span>
              <p className="font-mono">{channel.epgChannelId ?? "未绑定"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">匹配方式</span>
              <p>{channel.epgMatchType === "manual" ? "手动" : channel.epgMatchType === "auto" ? "自动" : "—"}</p>
            </div>
          </div>
        </section>

        {/* Programmes */}
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold">节目单</h2>
          {!channel.epgChannelId ? (
            <p className="text-sm text-muted-foreground py-4 text-center">未绑定 EPG，暂无节目单</p>
          ) : programmes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">暂无节目数据</p>
          ) : (
            <div className="space-y-2">
              {programmes.map((p) => (
                <div key={p.id} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                  <div className="shrink-0 text-muted-foreground font-mono text-xs min-w-[100px]">
                    {new Date(p.startAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {new Date(p.stopAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div>
                    <p className="font-medium">{p.title ?? "未命名"}</p>
                    {p.desc && <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{p.desc}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Streams */}
        <section className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">播放源</h2>
            <Button variant="outline" size="sm" onClick={() => { setEditingStream(null); setStreamDialogOpen(true); }}>
              <PlusIcon className="mr-1 h-4 w-4" />
              新增
            </Button>
          </div>
          {streams.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">暂无播放源</p>
          ) : (
            <div className="space-y-2">
              {streams.map((s) => {
                const hs = healthStatusMap[s.healthStatus] ?? { label: s.healthStatus, variant: "outline" as const };
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    {s.isPrimary ? (
                      <Badge variant="default" className="shrink-0 gap-1">
                        <StarIcon className="h-3 w-3" />
                        主源
                      </Badge>
                    ) : (
                      <div className="w-12 shrink-0" />
                    )}
                    <Badge variant={hs.variant} className="shrink-0">{hs.label}</Badge>
                    {s.m3uSourceName && (
                      <Badge variant="outline" className="shrink-0 text-xs">{s.m3uSourceName}</Badge>
                    )}
                    {s.streamCodec && (
                      <Badge variant="outline" className="shrink-0 text-xs">{s.streamCodec}</Badge>
                    )}
                    {s.streamWidth && s.streamHeight && (
                      <Badge variant="outline" className="shrink-0 text-xs">{s.streamWidth}×{s.streamHeight}</Badge>
                    )}
                    {s.streamBitrate && (
                      <Badge variant="outline" className="shrink-0 text-xs">{s.streamBitrate} kbps</Badge>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs truncate block">{s.streamUrl}</span>
                      {(s.sourceChannelName || s.responseTime) && (
                        <span className="text-[10px] text-muted-foreground">
                          {s.sourceChannelName ? `来源：${s.sourceChannelName}` : ""}
                          {s.sourceChannelName && s.responseTime ? " · " : ""}
                          {s.responseTime ? `${s.responseTime}ms` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!s.isPrimary && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setPrimaryMutation.mutate(s.id)}
                          aria-label="设为主源"
                          disabled={setPrimaryMutation.isPending}
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => { setEditingStream(s); setStreamDialogOpen(true); }}
                        aria-label="编辑"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setConfirmDeleteStreamId(s.id)}
                        aria-label="删除"
                        disabled={deleteStreamMutation.isPending}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Dialogs */}
      <AlertDialog open={!!confirmDeleteStreamId} onOpenChange={() => setConfirmDeleteStreamId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该播放源吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteStreamMutation.mutate(confirmDeleteStreamId!); setConfirmDeleteStreamId(null); }}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {channel && (
        <OutputChannelFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          channel={channel}
          onSubmit={async (body) => { await updateMutation.mutateAsync(body); }}
        />
      )}

      <EpgMatchDialog
        open={epgOpen}
        onOpenChange={setEpgOpen}
        currentEpgChannelId={channel.epgChannelId}
        onSelect={async (xmltvChannelId) => {
          await updateMutation.mutateAsync({ epgChannelId: xmltvChannelId });
          setEpgOpen(false);
        }}
        onClear={async () => {
          await updateMutation.mutateAsync({ epgChannelId: null });
          setEpgOpen(false);
        }}
        pending={updateMutation.isPending}
      />

      {streamDialogOpen && (
        <ChannelStreamDialog
          open={streamDialogOpen}
          onOpenChange={(open) => {
            setStreamDialogOpen(open);
            if (!open) setEditingStream(null);
          }}
          key={editingStream?.id ?? "new"}
          initialUrl={editingStream?.streamUrl}
          initialSourceChannelId={editingStream?.sourceChannelId}
          initialM3uSourceId={editingStream?.m3uSourceId}
          title={editingStream ? "编辑播放源" : "新增播放源"}
          editing={!!editingStream}
          onSubmit={async (data) => {
            if (editingStream) {
              await updateStreamMutation.mutateAsync({ streamId: editingStream.id, data });
            } else {
              await createStreamMutation.mutateAsync(data);
            }
          }}
        />
      )}
    </>
  );
}
