import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProColumns } from "@ant-design/pro-components";
import type { ProgrammeVo, PaginatedResponse, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button, Input, Select, Typography } from "antd";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { ReloadOutlined } from "@ant-design/icons";
import { FilterBar, PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/sources/programmes")({
  component: ProgrammesPreviewPage,
});

function getColumns(): ProColumns<ProgrammeVo>[] {
  return [
    {
      dataIndex: "xmltvChannelId",
      title: "频道 ID",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {record.xmltvChannelId}
        </span>
      ),
    },
    {
      dataIndex: "title",
      title: "标题",
      render: (_, record) => record.title ?? "-",
    },
    {
      dataIndex: "subTitle",
      title: "副标题",
      render: (_, record) => record.subTitle ?? "-",
    },
    {
      dataIndex: "category",
      title: "分类",
      render: (_, record) => record.category ?? "-",
    },
    {
      dataIndex: "startAt",
      title: "开始",
      render: (_, record) => new Date(record.startAt).toLocaleString("zh-CN"),
    },
    {
      dataIndex: "stopAt",
      title: "结束",
      render: (_, record) => new Date(record.stopAt).toLocaleString("zh-CN"),
    },
    {
      dataIndex: "desc",
      title: "简介",
      render: (_, record) => (
        <Typography.Text
          type="secondary"
          style={{
            fontSize: 12,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            maxWidth: 200,
          }}
        >
          {record.desc ?? "-"}
        </Typography.Text>
      ),
    },
  ];
}

function ProgrammesPreviewPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sourceId, setSourceId] = useState<string>("");
  const [channelId, setChannelId] = useState("");
  const [channelInput, setChannelInput] = useState("");

  const { data: sourcesData } = useQuery({
    queryKey: ["sources", "xmltv"],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<SourceVo> }>(
        "/sources",
        {
          params: { type: "xmltv", pageSize: 100 },
        },
      ),
  });

  const xmltvSources = sourcesData?.data?.items ?? [];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["programmes", page, pageSize, sourceId, channelId],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<ProgrammeVo> }>(
        "/programmes",
        {
          params: {
            page,
            pageSize,
            sourceId: sourceId || undefined,
            xmltvChannelId: channelId || undefined,
          },
        },
      ),
  });

  const programmes = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["programmes"] });
  }, [queryClient]);

  const columns = useMemo(() => getColumns(), []);

  return (
    <PageStack>
      <PageHeader
        title="节目单预览"
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
          aria-label="XMLTV 源筛选"
          options={[
            { value: "all", label: "全部 XMLTV 源" },
            ...xmltvSources.map((source) => ({
              value: source.id,
              label: source.name,
            })),
          ]}
          style={{ width: 200 }}
        />
        <Input
          placeholder="频道 ID 过滤"
          value={channelInput}
          onChange={(e) => setChannelInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setChannelId(channelInput);
              setPage(1);
            }
          }}
          style={{ maxWidth: 200 }}
          autoComplete="off"
        />
      </FilterBar>

      <ProTableWrapper<ProgrammeVo>
        columns={columns}
        dataSource={programmes}
        rowKey="id"
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        columnsStateKey="programmes-columns"
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
