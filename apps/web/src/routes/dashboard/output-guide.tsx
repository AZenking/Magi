import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { OutputGuideAnomaly, OutputGuideVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { FilterBar, PageHeader, PageStack } from "@/components/page-layout";
import {
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Pagination,
  Result,
  Select,
  Skeleton,
  Tag,
  Typography,
  theme,
} from "antd";
import { ExportOutlined, ReloadOutlined } from "@ant-design/icons";

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
  const { token } = theme.useToken();
  const [date, setDate] = useState(defaultDate);
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
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

  return (
    <PageStack>
      <PageHeader
        title="输出节目单"
        description="只读展示规范频道、来源限定 EPG 绑定与源节目数据的最终投影"
        actions={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void guideQuery.refetch()}
          >
            刷新
          </Button>
        }
      />
      <FilterBar>
        <Input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setPage(1);
          }}
          style={{ width: 160 }}
          aria-label="节目日期"
        />
        <Select
          value={group || "all"}
          onChange={(value) => {
            setGroup(value === "all" ? "" : value);
            setPage(1);
          }}
          style={{ width: 180 }}
          options={[
            { value: "all", label: "全部分组" },
            ...(groupsQuery.data?.data ?? []).map((item) => ({
              value: item.name,
              label: `${item.name} (${item.count})`,
            })),
          ]}
        />
        <Select
          value={status || "all"}
          onChange={(value) => {
            setStatus(value === "all" ? "" : value);
            setPage(1);
          }}
          style={{ width: 160 }}
          options={[
            { value: "all", label: "全部状态" },
            { value: "matched_manual", label: "手动匹配" },
            { value: "matched_auto", label: "自动匹配" },
            { value: "unmatched", label: "缺少 EPG" },
            { value: "conflict", label: "绑定冲突" },
            { value: "source_stale", label: "来源过期" },
            { value: "empty", label: "无节目" },
            { value: "gap", label: "节目空洞" },
            { value: "overlap", label: "节目重叠" },
          ]}
        />
        <Input.Search
          value={searchInput}
          placeholder="搜索输出频道"
          allowClear
          onChange={(event) => setSearchInput(event.target.value)}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          style={{ width: 240 }}
        />
      </FilterBar>

      {guideQuery.isLoading ? (
        <Skeleton active />
      ) : guideQuery.isError ? (
        <Result
          status="error"
          title="输出节目单加载失败"
          extra={<Button onClick={() => void guideQuery.refetch()}>重试</Button>}
        />
      ) : (guideQuery.data?.data.items.length ?? 0) === 0 ? (
        <Empty description="当前条件下没有输出频道" />
      ) : (
        <Flex vertical gap={token.marginMD}>
          {guideQuery.data!.data.items.map((item) => (
            <Card
              key={item.channel.id}
              size="small"
              title={
                <Flex wrap gap={token.marginXS} align="center">
                  <Typography.Text strong>
                    {item.channel.standardName}
                  </Typography.Text>
                  {item.channel.standardGroup && (
                    <Tag>{item.channel.standardGroup}</Tag>
                  )}
                  {item.anomalies.map((anomaly) => (
                    <Tag
                      key={anomaly}
                      color={
                        anomaly === "conflict" || anomaly === "overlap"
                          ? "error"
                          : "warning"
                      }
                    >
                      {anomalyLabels[anomaly]}
                    </Tag>
                  ))}
                </Flex>
              }
              extra={
                <Link
                  to="/dashboard/channels/$channelId"
                  params={{ channelId: item.channel.id }}
                >
                  <Button type="link" size="small" icon={<ExportOutlined />}>
                    EPG 绑定
                  </Button>
                </Link>
              }
            >
              <Typography.Text type="secondary">
                {item.channel.epgBinding?.xmltvSourceName ?? "无来源"} ·{" "}
                <Typography.Text code>
                  {item.channel.epgBinding?.xmltvChannelId ?? "未绑定"}
                </Typography.Text>
              </Typography.Text>
              {item.programmes.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无节目" />
              ) : (
                <Flex
                  gap={token.marginXS}
                  style={{
                    overflowX: "auto",
                    paddingTop: token.paddingSM,
                    paddingBottom: token.paddingXS,
                  }}
                >
                  {item.programmes.map((programme) => (
                    <Card
                      key={programme.id}
                      size="small"
                      style={{ minWidth: 190, maxWidth: 260 }}
                    >
                      <Typography.Text code>
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
                      <br />
                      <Typography.Text strong ellipsis>
                        {programme.title ?? "未命名节目"}
                      </Typography.Text>
                    </Card>
                  ))}
                </Flex>
              )}
            </Card>
          ))}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={guideQuery.data!.data.total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            }}
          />
        </Flex>
      )}
    </PageStack>
  );
}
