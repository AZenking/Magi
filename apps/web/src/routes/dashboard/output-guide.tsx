import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ProList } from "@ant-design/pro-components";
import type { ProColumns } from "@ant-design/pro-components";
import type {
  OutputGuideAnomaly,
  OutputGuideChannelVo,
  OutputGuideVo,
} from "@magi/types";
import { apiClient } from "@/services/api";
import {
  Avatar,
  Button,
  Card,
  Empty,
  Result,
  Tag,
  Typography,
} from "antd";
import { ExportOutlined, ReloadOutlined } from "@ant-design/icons";
import { PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/output-guide")({
  component: OutputGuidePage,
});

const anomalyLabels: Record<OutputGuideAnomaly, string> = {
  unmatched: "缺少 EPG",
  conflict: "绑定冲突",
  source_stale: "来源过期",
  empty: "无节目",
  gap: "节目空洞",
  overlap: "节目重叠",
};

function defaultDate(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function toRange(date: string) {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function OutputGuidePage() {
  const [date, setDate] = useState(defaultDate);
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const range = useMemo(() => toRange(date), [date]);

  const groupsQuery = useQuery({
    queryKey: ["channel-groups"],
    queryFn: () =>
      apiClient<{ success: boolean; data: { name: string; count: number }[] }>(
        "/output/groups",
      ),
  });
  const guideQuery = useQuery({
    queryKey: [
      "output-guide",
      range.from,
      range.to,
      group,
      search,
      status,
      page,
      pageSize,
    ],
    queryFn: () =>
      apiClient<{ success: boolean; data: OutputGuideVo }>("/output/guide", {
        params: {
          from: range.from,
          to: range.to,
          group: group || undefined,
          search: search || undefined,
          status: status || undefined,
          page,
          pageSize,
        },
      }),
  });

  const items = guideQuery.data?.data.items ?? [];
  const total = guideQuery.data?.data.total ?? 0;
  const groupOptions = useMemo(
    () => (groupsQuery.data?.data ?? []).map((g) => ({ value: g.name, label: `${g.name} (${g.count})` })),
    [groupsQuery.data],
  );

  // QueryFilter virtual columns: drive the search form, hidden from the list.
  const searchColumns: ProColumns<OutputGuideChannelVo>[] = [
    {
      title: "日期",
      dataIndex: "date",
      valueType: "date",
      hideInTable: true,
      initialValue: date,
    },
    {
      title: "分组",
      dataIndex: "group",
      valueType: "select",
      hideInTable: true,
      fieldProps: { options: groupOptions, allowClear: true, placeholder: "全部分组" },
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      hideInTable: true,
      valueEnum: {
        matched_manual: { text: "手动匹配" },
        matched_auto: { text: "自动匹配" },
        unmatched: { text: "缺少 EPG" },
        conflict: { text: "绑定冲突" },
        source_stale: { text: "来源过期" },
        empty: { text: "无节目" },
        gap: { text: "节目空洞" },
        overlap: { text: "节目重叠" },
      },
    },
    {
      title: "搜索",
      dataIndex: "keyword",
      hideInTable: true,
      fieldProps: { placeholder: "搜索输出频道" },
      search: { transform: (value) => ({ search: value }) },
    },
  ];

  const handleSearch = (params: Record<string, unknown>) => {
    // valueType "date" returns a Dayjs-ish string; normalize to YYYY-MM-DD.
    const rawDate = params.date as string | undefined;
    const normalized = rawDate ? String(rawDate).slice(0, 10) : defaultDate();
    setDate(normalized);
    setGroup((params.group as string) ?? "");
    setStatus((params.status as string) ?? "");
    setSearch((params.search as string) ?? "");
    setPage(1);
  };

  return (
    <PageStack>
      <PageHeader
        title="节目单预览"
        description="只读展示规范频道、来源限定 EPG 绑定与源节目数据的最终投影"
      />

      <ProList<OutputGuideChannelVo>
        rowKey={(item) => item.channel.id}
        dataSource={items}
        loading={guideQuery.isLoading}
        itemLayout="vertical"
        split
        columns={[
          ...searchColumns,
          {
            title: "频道",
            dataIndex: ["channel", "standardName"],
            listSlot: "avatar",
            search: false,
            render: (_, item) => (
              <Avatar
                shape="square"
                size={40}
                src={item.channel.standardLogo || undefined}
              >
                {item.channel.standardName?.slice(0, 1)}
              </Avatar>
            ),
          },
          {
            title: "频道",
            dataIndex: ["channel", "standardName"],
            listSlot: "title",
            search: false,
            render: (_, item) => (
              <Typography.Text strong>{item.channel.standardName}</Typography.Text>
            ),
          },
          {
            title: "信息",
            dataIndex: "anomalies",
            listSlot: "description",
            search: false,
            render: (_, item) => (
              <span>
                {item.channel.standardGroup && <Tag>{item.channel.standardGroup}</Tag>}
                {item.anomalies.map((a) => (
                  <Tag
                    key={a}
                    color={a === "conflict" || a === "overlap" ? "error" : "warning"}
                  >
                    {anomalyLabels[a]}
                  </Tag>
                ))}
                <Typography.Text type="secondary">
                  {item.channel.epgBinding?.xmltvSourceName ?? "无来源"} ·{" "}
                  <Typography.Text code>
                    {item.channel.epgBinding?.xmltvChannelId ?? "未绑定"}
                  </Typography.Text>
                </Typography.Text>
              </span>
            ),
          },
          {
            title: "节目",
            dataIndex: "programmes",
            listSlot: "content",
            search: false,
            render: (_, item) =>
              item.programmes.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无节目" />
              ) : (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 0" }}>
                  {item.programmes.map((p) => (
                    <Card key={p.id} size="small" style={{ minWidth: 190, maxWidth: 260 }}>
                      <Typography.Text code>
                        {new Date(p.startAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" – "}
                        {new Date(p.stopAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Typography.Text>
                      <br />
                      <Typography.Text strong ellipsis>
                        {p.title ?? "未命名节目"}
                      </Typography.Text>
                    </Card>
                  ))}
                </div>
              ),
          },
          {
            title: "操作",
            dataIndex: "option",
            valueType: "option",
            listSlot: "actions",
            search: false,
            render: (_, item) => [
              <Link
                key="epg"
                to="/dashboard/channels/$channelId"
                params={{ channelId: item.channel.id }}
              >
                <Button type="link" size="small" icon={<ExportOutlined />}>
                  EPG 绑定
                </Button>
              </Link>,
            ],
          },
        ]}
        search={{ labelWidth: "auto", defaultCollapsed: false }}
        onSubmit={(params) => handleSearch(params as Record<string, unknown>)}
        onReset={() =>
          handleSearch({ date: defaultDate(), group: "", status: "", search: "" })
        }
        toolBarRender={() => [
          <Button
            key="refresh"
            icon={<ReloadOutlined />}
            onClick={() => void guideQuery.refetch()}
          >
            刷新
          </Button>,
        ]}
        locale={{
          emptyText: guideQuery.isError ? (
            <Result
              status="error"
              title="输出节目单加载失败"
              extra={
                <Button onClick={() => void guideQuery.refetch()}>重试</Button>
              }
            />
          ) : (
            <Empty description="当前条件下没有输出频道" />
          ),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPageSize === pageSize ? nextPage : 1);
            setPageSize(nextPageSize);
          },
        }}
      />
    </PageStack>
  );
}
