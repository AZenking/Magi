import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProColumns } from "@ant-design/pro-components";
import type { ProgrammeVo, PaginatedResponse, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button, Typography } from "antd";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { ReloadOutlined } from "@ant-design/icons";
import { PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/sources/programmes")({
  component: ProgrammesPreviewPage,
});

function getColumns(xmltvSourceOptions?: { value: string; label: string }[]): ProColumns<ProgrammeVo>[] {
  return [
    // Virtual column: XMLTV source filter, lives only in the search form.
    {
      title: "XMLTV 源",
      dataIndex: "sourceId",
      valueType: "select",
      hideInTable: true,
      fieldProps: { options: xmltvSourceOptions, allowClear: true, placeholder: "全部 XMLTV 源" },
    },
    // Virtual column: channel ID text filter, maps to xmltvChannelId param.
    {
      title: "频道 ID",
      dataIndex: "channelId",
      hideInTable: true,
      search: {
        transform: (value) => ({ xmltvChannelId: value }),
      },
    },
    {
      dataIndex: "xmltvChannelId",
      title: "频道 ID",
      search: false,
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {record.xmltvChannelId}
        </span>
      ),
    },
    {
      dataIndex: "title",
      title: "标题",
      search: false,
      render: (_, record) => record.title ?? "-",
    },
    {
      dataIndex: "subTitle",
      title: "副标题",
      search: false,
      render: (_, record) => record.subTitle ?? "-",
    },
    {
      dataIndex: "category",
      title: "分类",
      search: false,
      render: (_, record) => record.category ?? "-",
    },
    {
      dataIndex: "startAt",
      title: "开始",
      search: false,
      render: (_, record) => new Date(record.startAt).toLocaleString("zh-CN"),
    },
    {
      dataIndex: "stopAt",
      title: "结束",
      search: false,
      render: (_, record) => new Date(record.stopAt).toLocaleString("zh-CN"),
    },
    {
      dataIndex: "desc",
      title: "简介",
      search: false,
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
  const xmltvSourceOptions = useMemo(
    () => xmltvSources.map((source) => ({ value: source.id, label: source.name })),
    [xmltvSources],
  );

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

  const columns = useMemo(() => getColumns(xmltvSourceOptions), [xmltvSourceOptions]);

  const handleSearch = useCallback((params: Record<string, unknown>) => {
    setSourceId((params.sourceId as string) ?? "");
    setChannelId((params.xmltvChannelId as string) ?? "");
    setPage(1);
  }, []);

  return (
    <PageStack>
      <PageHeader
        title="源节目数据"
        description="按 XMLTV 来源检查原始节目数据；此处不代表最终对外输出"
      />

      <ProTableWrapper<ProgrammeVo>
        columns={columns}
        dataSource={programmes}
        rowKey="id"
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        search={true}
        onSearch={handleSearch}
        toolBarRender={() => [
          <Button
            key="refresh"
            icon={<ReloadOutlined />}
            onClick={refresh}
            aria-label="刷新"
          >
            刷新
          </Button>,
        ]}
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
