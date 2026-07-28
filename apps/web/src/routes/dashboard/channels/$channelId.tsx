import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  Dropdown,
  Empty,
  Flex,
  Grid,
  List,
  Modal,
  Result,
  Tag,
  Typography,
  theme,
} from "antd";
import { ProDescriptions, ProList } from "@ant-design/pro-components";
import type { MenuProps } from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  LinkOutlined,
  PlusOutlined,
  RestOutlined,
  StarFilled,
  StopOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import type {
  ChannelStreamVo,
  EpgBindingVo,
  OutputChannelDetailVo,
  OutputGuideVo,
} from "@magi/types";
import { useFeedback } from "@/lib/feedback";
import { apiClient } from "@/services/api";
import { LogoUpload } from "@/features/dashboard/channels/logo-upload";
import { OutputChannelFormDialog } from "@/features/dashboard/channels/channel-form-dialog";
import { EpgMatchDialog } from "@/features/dashboard/channels/epg-match-dialog";
import { ChannelStreamDialog } from "@/features/dashboard/channels/channel-stream-dialog";
import {
  changeChannelLifecycle,
  formatPurgeAfter,
  lifecycleMap,
} from "@/features/dashboard/channels/channel-lifecycle-actions";
import { ChannelStreamOrder } from "@/features/dashboard/channels/channel-stream-order";
import { ChannelFailoverPolicy } from "@/features/dashboard/channels/channel-failover-policy";
import { PageStack } from "@/components/page-layout";
import { PageSkeleton, InlineSkeleton } from "@/components/page-skeleton";

export const Route = createFileRoute("/dashboard/channels/$channelId")({
  component: ChannelDetailPage,
});

const epgStatusMap: Record<string, { label: string; color?: string }> = {
  matched_auto: { label: "自动匹配", color: "processing" },
  matched_manual: { label: "手动匹配", color: "blue" },
  unmatched: { label: "未匹配" },
  conflict: { label: "冲突", color: "error" },
};

const healthStatusMap: Record<string, { label: string; color?: string }> = {
  online: { label: "在线", color: "success" },
  offline: { label: "离线", color: "error" },
  degraded: { label: "降级", color: "warning" },
  unknown: { label: "未知" },
};

type LifecycleTarget = "active" | "hidden" | "disabled" | "trashed";

/** T061: build the lifecycle dropdown items allowed from the current state. */
function buildLifecycleMenuItems(
  current: LifecycleTarget,
  handlers: {
    onTransition: (
      target: LifecycleTarget,
      title: string,
      danger: boolean,
    ) => void;
    onPurge: () => void;
  },
): MenuProps["items"] {
  const item = (
    key: LifecycleTarget,
    label: string,
    icon: ReactNode,
    danger = false,
  ) => ({ key, label, icon, danger, onClick: () => handlers.onTransition(key, label, danger) });
  const items: NonNullable<MenuProps["items"]> = [];
  if (current !== "active")
    items.push(item("active", "恢复输出", <UndoOutlined />));
  if (current !== "hidden" && current !== "trashed")
    items.push(item("hidden", "隐藏", <EyeInvisibleOutlined />));
  if (current !== "disabled" && current !== "trashed")
    items.push(item("disabled", "禁用", <StopOutlined />));
  if (current !== "trashed") {
    items.push(item("trashed", "移入回收站", <RestOutlined />, true));
  } else {
    items.push({ type: "divider" });
    items.push({
      key: "purge",
      label: "永久删除（预览）",
      icon: <DeleteOutlined />,
      danger: true,
      onClick: handlers.onPurge,
    });
  }
  return items;
}

function ChannelDetailPage() {
  const { message } = useFeedback();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const channelId = Route.useParams().channelId;
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [epgOpen, setEpgOpen] = useState(false);
  const [streamDialogOpen, setStreamDialogOpen] = useState(false);
  const [editingStream, setEditingStream] = useState<ChannelStreamVo | null>(
    null,
  );
  const [confirmDeleteStreamId, setConfirmDeleteStreamId] = useState<
    string | null
  >(null);
  // T061: single-channel lifecycle transition + purge preview state.
  const [pendingLifecycle, setPendingLifecycle] = useState<
    | { target: "active" | "hidden" | "disabled" | "trashed"; title: string; danger: boolean }
    | null
  >(null);
  const [purgePreviewOpen, setPurgePreviewOpen] = useState(false);

  const {
    data: detail,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["output-channel-detail", channelId],
    queryFn: () =>
      apiClient<{ success: boolean; data: OutputChannelDetailVo }>(
        `/output/channels/${channelId}`,
      ),
  });
  const channel = detail?.data?.channel;
  const streams = detail?.data?.streams ?? [];
  const guideRange = (() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  })();

  const {
    data: progData,
    isError: programmesError,
    refetch: refetchProgrammes,
  } = useQuery({
    queryKey: ["output-guide", channelId, guideRange.from],
    queryFn: () =>
      apiClient<{ success: boolean; data: OutputGuideVo }>(
        "/output/guide",
        {
          params: {
            from: guideRange.from,
            to: guideRange.to,
            channelId,
            page: 1,
            pageSize: 1,
          },
        },
      ),
    enabled: !!channel,
  });
  const programmes = progData?.data?.items[0]?.programmes ?? [];

  const invalidateChannel = () => {
    void queryClient.invalidateQueries({
      queryKey: ["output-channel-detail", channelId],
    });
    void queryClient.invalidateQueries({ queryKey: ["output-channels"] });
  };
  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiClient(`/output/channels/${channelId}`, { method: "PUT", body }),
    onSuccess: invalidateChannel,
    onError: (error) => message.error(`保存失败：${error.message}`),
  });
  const epgBindingMutation = useMutation({
    mutationFn: async (body: {
      xmltvSourceId: string | null;
      epgChannelId: string | null;
      locked: boolean;
      reason?: string;
    }) =>
      apiClient<{ success: boolean; data: EpgBindingVo }>(
        `/output/channels/${channelId}/epg-binding`,
        {
          method: "PATCH",
          headers: {
            "If-Match": String(channel?.epgBinding?.version ?? 0),
          },
          body,
        },
      ),
    onSuccess: () => {
      invalidateChannel();
      void queryClient.invalidateQueries({ queryKey: ["output-guide"] });
    },
    onError: (error) => message.error(`EPG 绑定失败：${error.message}`),
  });
  const createStreamMutation = useMutation({
    mutationFn: async (data: {
      streamUrl: string;
      m3uSourceId?: string | null;
      sourceChannelId?: string | null;
    }) =>
      apiClient(`/output/channels/${channelId}/streams`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidateChannel,
    onError: (error) => message.error(`新增播放源失败：${error.message}`),
  });
  const updateStreamMutation = useMutation({
    mutationFn: async ({
      streamId,
      data,
    }: {
      streamId: string;
      data: {
        streamUrl?: string;
        m3uSourceId?: string | null;
        sourceChannelId?: string | null;
      };
    }) =>
      apiClient(`/output/channels/${channelId}/streams/${streamId}`, {
        method: "PUT",
        body: data,
      }),
    onSuccess: invalidateChannel,
    onError: (error) => message.error(`更新播放源失败：${error.message}`),
  });
  const deleteStreamMutation = useMutation({
    mutationFn: async (streamId: string) =>
      apiClient(`/output/channels/${channelId}/streams/${streamId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidateChannel,
    onError: (error) => message.error(`删除失败：${error.message}`),
  });
  const setPrimaryMutation = useMutation({
    mutationFn: async (streamId: string) =>
      apiClient(`/output/channels/${channelId}/streams/${streamId}/primary`, {
        method: "POST",
      }),
    onSuccess: invalidateChannel,
    onError: (error) => message.error(`设为主源失败：${error.message}`),
  });
  // T061: reversible lifecycle transition (single channel, If-Match version).
  const lifecycleMutation = useMutation({
    mutationFn: async (target: "active" | "hidden" | "disabled" | "trashed") => {
      if (!channel) throw new Error("Channel not loaded");
      return changeChannelLifecycle(channel, target);
    },
    onSuccess: (_d, target) => {
      message.success(`${lifecycleMap[target].label} 已更新`);
      invalidateChannel();
      void queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    },
    onError: (error) => message.error(`操作失败：${error.message}`),
  });
  // T061: purge preview — read-only impact; the destructive apply goes via
  // POST /operations/previews kind=channel_purge (contracts/channels.md).
  const { data: purgePreviewData, isLoading: purgePreviewLoading } = useQuery({
    queryKey: ["channel-purge-preview", channelId],
    queryFn: () =>
      apiClient<{ success: boolean; data: { relations: Array<{ type: string; count: number; recoverable: boolean }>; purgeAfter: string | null } }>(
        `/output/channels/${channelId}/purge-preview`,
      ),
    enabled: purgePreviewOpen,
  });

  if (isLoading) return <PageSkeleton description="正在加载频道详情…" />;
  if (isError) {
    return (
      <Result
        status="error"
        title="频道详情加载失败"
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    );
  }
  if (!channel) {
    return (
      <Result
        status="404"
        title="频道不存在"
        extra={
          <Link to="/dashboard/channels">
            <Button>返回频道列表</Button>
          </Link>
        }
      />
    );
  }

  const epgStatus = epgStatusMap[channel.epgStatus] ?? {
    label: channel.epgStatus,
  };

  return (
    <>
      <PageStack>
        <Flex wrap align="center" gap={token.marginMD}>
          <Link to="/dashboard/channels">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              aria-label="返回频道列表"
            />
          </Link>
          <LogoUpload
            currentLogo={channel.standardLogo}
            channelId={channel.id}
            onLogoChange={() =>
              void queryClient.invalidateQueries({
                queryKey: ["output-channel-detail", channelId],
              })
            }
          />
          <Flex vertical style={{ minWidth: 0 }}>
            <Typography.Title level={2} ellipsis style={{ margin: 0 }}>
              {channel.standardName}
            </Typography.Title>
            {channel.standardGroup && (
              <Typography.Text type="secondary">
                {channel.standardGroup}
              </Typography.Text>
            )}
          </Flex>
          <Flex
            wrap
            gap={token.marginXS}
            style={{ marginLeft: screens.sm ? "auto" : 0 }}
          >
            <Tag color={epgStatus.color}>{epgStatus.label}</Tag>
            {channel.lifecycle && (
              <Tag color={lifecycleMap[channel.lifecycle].color}>
                {lifecycleMap[channel.lifecycle].label}
              </Tag>
            )}
            <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
              编辑
            </Button>
            {/* T061: lifecycle action menu — transitions allowed from current state. */}
            <Dropdown
              menu={{
                items: buildLifecycleMenuItems(channel.lifecycle ?? "active", {
                  onTransition: (target, title, danger) =>
                    setPendingLifecycle({ target, title, danger }),
                  onPurge: () => setPurgePreviewOpen(true),
                }),
              }}
              trigger={["click"]}
            >
              <Button>
                生命周期 <DownOutlined />
              </Button>
            </Dropdown>
          </Flex>
        </Flex>

        <Card
          title="EPG 匹配"
          extra={
            <Button size="small" onClick={() => setEpgOpen(true)}>
              修改绑定
            </Button>
          }
        >
          <ProDescriptions
            column={{ xs: 1, sm: 2 }}
            dataSource={channel}
            columns={[
              {
                dataIndex: "epgBinding",
                title: "XMLTV 来源",
                render: (_, entity) =>
                  entity.epgBinding?.xmltvSourceName ??
                  entity.epgBinding?.xmltvSourceId ??
                  "未绑定",
              },
              {
                dataIndex: "epgBinding",
                title: "EPG Channel",
                render: (_, entity) => (
                  <Typography.Text code>
                    {entity.epgBinding?.xmltvChannelId ?? "未绑定"}
                  </Typography.Text>
                ),
              },
              {
                dataIndex: "epgMatchType",
                title: "匹配方式",
                render: (_, entity) =>
                  entity.epgMatchType === "manual"
                    ? "手动"
                    : entity.epgMatchType === "auto"
                      ? "自动"
                      : "—",
              },
            ]}
          />
        </Card>

        <Card title="输出节目单（今日有效投影）">
          {programmesError ? (
            <Result
              status="error"
              title="节目单加载失败"
              extra={
                <Button onClick={() => void refetchProgrammes()}>重试</Button>
              }
            />
          ) : !channel.epgBinding?.xmltvChannelId ? (
            <Empty description="未绑定 EPG，暂无节目单" />
          ) : programmes.length === 0 ? (
            <Empty description="暂无节目数据" />
          ) : (
            <List
              dataSource={programmes}
              renderItem={(programme) => (
                <List.Item>
                  <Flex
                    gap={token.marginSM}
                    align="start"
                    style={{ width: "100%" }}
                  >
                    <Typography.Text code style={{ flexShrink: 0 }}>
                      {new Date(programme.startAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" – "}
                      {new Date(programme.stopAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Typography.Text>
                    <Flex vertical style={{ minWidth: 0 }}>
                      <Typography.Text strong>
                        {programme.title ?? "未命名"}
                      </Typography.Text>
                      {programme.desc && (
                        <Typography.Text type="secondary" ellipsis>
                          {programme.desc}
                        </Typography.Text>
                      )}
                    </Flex>
                  </Flex>
                </List.Item>
              )}
            />
          )}
        </Card>

        <Card
          title="播放源"
          extra={
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingStream(null);
                setStreamDialogOpen(true);
              }}
            >
              新增
            </Button>
          }
        >
          {streams.length === 0 ? (
            <Empty description="暂无播放源" />
          ) : (
            <>
            <ProList<ChannelStreamVo>
              rowKey="id"
              dataSource={streams}
              split
              metas={{
                title: {
                  render: (_, stream) => {
                    const healthStatus = healthStatusMap[stream.healthStatus] ?? {
                      label: stream.healthStatus,
                    };
                    return (
                      <Flex wrap gap={token.marginXS}>
                        {stream.isPrimary && (
                          <Tag color="blue" icon={<StarFilled />}>
                            主源
                          </Tag>
                        )}
                        <Tag color={healthStatus.color}>
                          {healthStatus.label}
                        </Tag>
                        {stream.m3uSourceName && (
                          <Tag>{stream.m3uSourceName}</Tag>
                        )}
                        {stream.streamCodec && (
                          <Tag>{stream.streamCodec}</Tag>
                        )}
                        {stream.streamWidth && stream.streamHeight && (
                          <Tag>
                            {stream.streamWidth}×{stream.streamHeight}
                          </Tag>
                        )}
                        {stream.streamBitrate && (
                          <Tag>{stream.streamBitrate} kbps</Tag>
                        )}
                      </Flex>
                    );
                  },
                },
                description: {
                  render: (_, stream) => (
                    <Flex vertical style={{ minWidth: 0 }}>
                      <Typography.Text code copyable ellipsis>
                        {stream.streamUrl}
                      </Typography.Text>
                      {(stream.sourceChannelName ||
                        stream.responseTime) && (
                        <Typography.Text type="secondary">
                          {stream.sourceChannelName
                            ? `来源：${stream.sourceChannelName}`
                            : ""}
                          {stream.sourceChannelName && stream.responseTime
                            ? " · "
                            : ""}
                          {stream.responseTime
                            ? `${stream.responseTime}ms`
                            : ""}
                        </Typography.Text>
                      )}
                    </Flex>
                  ),
                },
                actions: {
                  render: (_, stream) => {
                    const actions: React.ReactNode[] = [];
                    if (!stream.isPrimary) {
                      actions.push(
                        <Button
                          key="primary"
                          type="text"
                          icon={<LinkOutlined />}
                          aria-label="设为主源"
                          loading={setPrimaryMutation.isPending}
                          onClick={() => setPrimaryMutation.mutate(stream.id)}
                        />,
                      );
                    }
                    actions.push(
                      <Button
                        key="edit"
                        type="text"
                        icon={<EditOutlined />}
                        aria-label="编辑"
                        onClick={() => {
                          setEditingStream(stream);
                          setStreamDialogOpen(true);
                        }}
                      />,
                      <Button
                        key="delete"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="删除"
                        loading={deleteStreamMutation.isPending}
                        onClick={() => setConfirmDeleteStreamId(stream.id)}
                      />,
                    );
                    return actions;
                  },
                },
              }}
            />
            {/* T121: reorderable list with primary/eligibility controls. Lives
                below the per-row edit/delete actions so both surfaces stay
                focused. Disabled channels keep their streams visible but the
                order is still editable for when it is restored. */}
            <Flex
              vertical
              gap={token.marginSM}
              style={{
                marginTop: token.marginMD,
                paddingTop: token.paddingMD,
                borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
              }}
            >
              <Typography.Text strong>顺序与故障转移</Typography.Text>
              <ChannelStreamOrder
                channel={channel}
                streams={streams}
                onSaved={invalidateChannel}
              />
            </Flex>
            </>
          )}
        </Card>

        <Card title="故障转移策略">
          <ChannelFailoverPolicy channelId={channel.id} />
        </Card>
      </PageStack>

      <Modal
        open={!!confirmDeleteStreamId}
        title="确认删除"
        okText="删除"
        okButtonProps={{
          danger: true,
          loading: deleteStreamMutation.isPending,
        }}
        cancelText="取消"
        onCancel={() => setConfirmDeleteStreamId(null)}
        onOk={() => {
          deleteStreamMutation.mutate(confirmDeleteStreamId!);
          setConfirmDeleteStreamId(null);
        }}
        destroyOnHidden
      >
        确定要删除该播放源吗？此操作不可撤销。
      </Modal>

      <OutputChannelFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        channel={channel}
        onSubmit={async (body) => {
          await updateMutation.mutateAsync(body);
        }}
      />
      <EpgMatchDialog
        open={epgOpen}
        onOpenChange={setEpgOpen}
        currentEpgChannelId={channel.epgBinding?.xmltvChannelId ?? null}
        manualLocked={channel.epgBinding?.locked}
        xmltvSourceId={
          channel.epgBinding?.xmltvSourceName ??
          channel.epgBinding?.xmltvSourceId
        }
        onSelect={async (candidate, locked) => {
          await epgBindingMutation.mutateAsync({
            xmltvSourceId: candidate.sourceId,
            epgChannelId: candidate.xmltvId,
            locked,
            reason: "Admin manual binding",
          });
          setEpgOpen(false);
        }}
        onClear={async () => {
          await epgBindingMutation.mutateAsync({
            xmltvSourceId: null,
            epgChannelId: null,
            locked: false,
            reason: "Admin cleared binding",
          });
          setEpgOpen(false);
        }}
        pending={epgBindingMutation.isPending}
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
          onSubmit={async (data) => {
            if (editingStream) {
              await updateStreamMutation.mutateAsync({
                streamId: editingStream.id,
                data,
              });
            } else {
              await createStreamMutation.mutateAsync(data);
            }
          }}
        />
      )}

      {/* T061: lifecycle transition confirmation (single channel). */}
      <Modal
        open={!!pendingLifecycle}
        title={`确认${pendingLifecycle?.title ?? ""}`}
        okText={pendingLifecycle?.title}
        okButtonProps={{
          danger: pendingLifecycle?.danger,
          loading: lifecycleMutation.isPending,
        }}
        cancelText="取消"
        onCancel={() => setPendingLifecycle(null)}
        onOk={() => {
          if (pendingLifecycle) lifecycleMutation.mutate(pendingLifecycle.target);
          setPendingLifecycle(null);
        }}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Flex vertical gap={token.marginXS}>
          <Typography.Text>
            将对频道「{channel.standardName}」执行「{pendingLifecycle?.title}」。
          </Typography.Text>
          {pendingLifecycle?.target === "trashed" && (
            <Typography.Text type="secondary">
              回收站中的频道将在 30 天后可被永久清除，期间可随时恢复。
            </Typography.Text>
          )}
        </Flex>
      </Modal>

      {/* T061: independent purge preview — names every unrecoverable relationship. */}
      <Modal
        open={purgePreviewOpen}
        title="永久删除预览"
        okText="前往正式清除"
        cancelText="关闭"
        onCancel={() => setPurgePreviewOpen(false)}
        onOk={() => {
          setPurgePreviewOpen(false);
          // Purge apply is a high-risk operation: route the operator to the
          // operations preview flow (kind=channel_purge) rather than a one-click.
          message.info("请在操作预览中确认后执行永久清除");
        }}
        width={560}
        mask={{ closable: false }}
        destroyOnHidden
      >
        {purgePreviewLoading ? (
          <InlineSkeleton />
        ) : (
          <Flex vertical gap={token.marginSM}>
            <Tag color="error">
              此操作不可撤销，以下关系将变为不可恢复：
            </Tag>
            <List
              size="small"
              dataSource={purgePreviewData?.data?.relations ?? []}
              renderItem={(rel) => (
                <List.Item>
                  <Flex justify="space-between" style={{ width: "100%" }}>
                    <Typography.Text>{rel.type}</Typography.Text>
                    <Typography.Text type="secondary">
                      {rel.count} 项{rel.recoverable ? "" : "（不可恢复）"}
                    </Typography.Text>
                  </Flex>
                </List.Item>
              )}
            />
            <Typography.Text type="secondary">
              可清除时间：{formatPurgeAfter(purgePreviewData?.data?.purgeAfter ?? channel.purgeAfter)}
            </Typography.Text>
          </Flex>
        )}
      </Modal>
    </>
  );
}
