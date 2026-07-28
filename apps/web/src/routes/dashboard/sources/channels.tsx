import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProColumns } from "@ant-design/pro-components";
import type { ChannelVo, PaginatedResponse, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { Avatar, Button, Select, Tag } from "antd";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { ReloadOutlined } from "@ant-design/icons";
import { FilterBar, PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/sources/channels")({
  component: RawChannelsPage,
});

const streamStatusMap: Record<string, { label: string; color?: string }> = {
  online: { label: "在线", color: "green" },
  offline: { label: "离线", color: "red" },
  degraded: { label: "降级", color: "orange" },
  unknown: { label: "未知" },
};

function getColumns(): ProColumns<ChannelVo>[] {
  return [
    {
      dataIndex: "displayName",
      title: "频道名",
      render: (_, record) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar
            shape="square"
            size={20}
            src={record.tvgLogo || undefined}
          >
            {record.displayName.slice(0, 1)}
          </Avatar>
          <span style={{ fontWeight: 600 }}>{record.displayName}</span>
        </div>
      ),
    },
    {
      dataIndex: "groupTitle",
      title: "分组",
      render: (_, record) => record.groupTitle ?? "-",
    },
    {
      dataIndex: "tvgId",
      title: "tvgId",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {record.tvgId ?? "-"}
        </span>
      ),
    },
    {
      dataIndex: "epgChannelId",
      title: "EPG 绑定",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {record.epgChannelId ?? "-"}
        </span>
      ),
    },
    {
      dataIndex: "epgMatchType",
      title: "匹配方式",
      render: (_, record) => record.epgMatchType ?? "-",
    },
    {
      dataIndex: "active",
      title: "激活",
      render: (_, record) => (
        <Tag color={record.active ? "blue" : undefined}>
          {record.active ? "是" : "否"}
        </Tag>
      ),
    },
    {
      dataIndex: "streamStatus",
      title: "流状态",
      render: (_, record) => {
        const s = streamStatusMap[record.streamStatus ?? "unknown"] ?? {
          label: record.streamStatus ?? "未知",
        };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      dataIndex: "updatedAt",
      title: "更新时间",
      render: (_, record) =>
        new Date(record.updatedAt).toLocaleString("zh-CN"),
    },
  ];
}

function RawChannelsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sourceId, setSourceId] = useState<string>("");

  const { data: sourcesData } = useQuery({
    queryKey: ["sources", "m3u"],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<SourceVo> }>(
        "/sources",
        {
          params: { type: "m3u", pageSize: 100 },
        },
      ),
  });

  const m3uSources = sourcesData?.data?.items ?? [];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["raw-channels", page, pageSize, sourceId],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<ChannelVo> }>(
        "/channels",
        {
          params: {
            page,
            pageSize,
            sourceId: sourceId || undefined,
          },
        },
      ),
  });

  const channels = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["raw-channels"] });
  }, [queryClient]);

  const columns = useMemo(() => getColumns(), []);

  return (
    <PageStack>
      <PageHeader
        title="原始频道"
        actions={
          <Button
            shape="circle"
            icon={<ReloadOutlined />}
            onClick={refresh}
            aria-label="刷新"
          />
        }
      />

      <FilterBar>
        <Select
          value={sourceId || "all"}
          onChange={(v) => {
            setSourceId(v === "all" ? "" : v);
            setPage(1);
          }}
          aria-label="M3U 源筛选"
          options={[
            { value: "all", label: "全部 M3U 源" },
            ...m3uSources.map((source) => ({
              value: source.id,
              label: source.name,
            })),
          ]}
          style={{ width: 200 }}
        />
      </FilterBar>

      <ProTableWrapper<ChannelVo>
        columns={columns}
        dataSource={channels}
        rowKey="id"
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        columnsStateKey="raw-channels-columns"
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          },
        }}
      />
    </PageStack>
  );
}
