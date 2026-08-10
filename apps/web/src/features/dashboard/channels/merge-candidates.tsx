/**
 * MergeCandidateReview (009-m3u-control-plane T030).
 *
 * Lists weak-signal composition candidates and lets the operator accept or
 * reject each one. Accepting creates a manual canonical-channel-member
 * relationship; rejecting suppresses the same pairing on subsequent runs.
 *
 * antd v6 visual language (T001): one primary action per row, token-driven
 * semantic colors. The component is intentionally minimal — pagination and
 * filtering follow the existing ProTable patterns.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Image,
  Popconfirm,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";
import type { MergeCandidateVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";

const { Title, Text } = Typography;

interface Envelope<T> {
  success: boolean;
  data: T;
}
interface ListResponse {
  items: MergeCandidateVo[];
  total: number;
  page: number;
  pageSize: number;
}

export function MergeCandidateReview() {
  const { notification } = useFeedback();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["merge-candidates", page, pageSize],
    queryFn: async () => {
      const res = await apiClient<Envelope<ListResponse>>(
        "/output/merge-candidates",
        {
          params: {
            status: "pending",
            page,
            pageSize,
          },
        },
      );
      return res.data;
    },
  });

  const review = useMutation({
    mutationFn: async (input: {
      id: string;
      decision: "accept" | "reject";
      canonicalChannelId?: string;
      reason?: string;
    }) => {
      const res = await apiClient<Envelope<unknown>>(
        `/output/merge-candidates/${input.id}/review`,
        {
          method: "POST",
          body: {
            decision: input.decision,
            canonicalChannelId: input.canonicalChannelId,
            reason: input.reason,
          },
        },
      );
      return res.data;
    },
    onSuccess: async (_d, input) => {
      message.success(
        input.decision === "accept" ? "已接受候选,已建立手动成员关系" : "已拒绝候选,后续相同输入将不再建议",
      );
      await qc.invalidateQueries({ queryKey: ["merge-candidates"] });
    },
    onError: (err: unknown) => {
      notification.error({
        title: "审核失败",
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    },
  });

  const batchReview = useMutation({
    mutationFn: async (input: { decision: "accept" | "reject" }) => {
      const res = await apiClient<Envelope<{ updated: number }>>(
        "/output/merge-candidates/batch/review",
        {
          method: "POST",
          body: {
            ids: selectedRowKeys.map(String),
            decision: input.decision,
          },
        },
      );
      return res.data;
    },
    onSuccess: async (data, input) => {
      message.success(
        `${input.decision === "accept" ? "已接受" : "已拒绝"} ${data.updated} 个候选`,
      );
      setSelectedRowKeys([]);
      await qc.invalidateQueries({ queryKey: ["merge-candidates"] });
    },
    onError: (err: unknown) => {
      notification.error({
        title: "批量审核失败",
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    },
  });

  const columns: ColumnsType<MergeCandidateVo> = [
    {
      title: "来源频道",
      key: "sourceChannel",
      render: (_, r) => (
        <Space size={8} align="start">
          {r.sourceTvgLogo ? (
            <Image
              src={r.sourceTvgLogo}
              width={32}
              height={32}
              style={{ objectFit: "contain", borderRadius: 4 }}
              fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIvPg=="
              preview={false}
            />
          ) : null}
          <div>
            <Text strong>{r.sourceChannelName ?? r.sourceChannelId.slice(0, 8)}</Text>
            {r.sourceGroupTitle ? (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {r.sourceGroupTitle}
                </Text>
              </div>
            ) : null}
          </div>
        </Space>
      ),
    },
    {
      title: "目标频道",
      key: "canonicalChannel",
      render: (_, r) =>
        r.canonicalChannelId ? (
          <div>
            <Text strong>
              {r.canonicalChannelName ?? r.canonicalChannelId.slice(0, 8)}
            </Text>
            {r.canonicalGroupTitle ? (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {r.canonicalGroupTitle}
                </Text>
              </div>
            ) : null}
          </div>
        ) : (
          <Text type="secondary">未指定</Text>
        ),
    },
    {
      title: "置信度",
      dataIndex: "confidence",
      key: "confidence",
      width: 100,
      render: (c: number | null) =>
        c != null ? (
          <Progress percent={Math.round(c * 100)} size="small" />
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "匹配方式",
      dataIndex: "method",
      key: "method",
      render: (m: MergeCandidateVo["method"]) => (
        <Tag color={m === "normalized_name_group" ? "blue" : "default"}>
          {m === "normalized_name_group" ? "名称+分组" : "仅名称"}
        </Tag>
      ),
    },
    {
      title: "理由",
      dataIndex: "reasons",
      key: "reasons",
      render: (reasons: string[]) => (
        <Space size={4} wrap>
          {reasons.map((r) => (
            <Tag key={r}>{r}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, record) => (
        <Space size={8}>
          <Button
            type="primary"
            size="small"
            loading={review.isPending}
            onClick={() =>
              review.mutate({
                id: record.id,
                decision: "accept",
                canonicalChannelId: record.canonicalChannelId ?? undefined,
              })
            }
          >
            接受
          </Button>
          <Button
            size="small"
            loading={review.isPending}
            onClick={() => review.mutate({ id: record.id, decision: "reject" })}
          >
            拒绝
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={4}>合并候选审核</Title>
        <Text type="secondary">
          仅相同 tvg-id 的来源频道会自动合并;名称/分组相似的频道需要您确认后才会建立手动关系。
        </Text>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          title="加载失败"
          description={
            <Space orientation="vertical" size={4}>
              <Text>{error instanceof Error ? error.message : "请稍后重试"}</Text>
              <Button size="small" onClick={() => void refetch()}>
                重试
              </Button>
            </Space>
          }
        />
      )}

      {selectedRowKeys.length > 0 && (
        <Space size={12}>
          <Text type="secondary">已选 {selectedRowKeys.length} 项</Text>
          <Popconfirm
            title={`确定接受 ${selectedRowKeys.length} 个候选?`}
            onConfirm={() => batchReview.mutate({ decision: "accept" })}
          >
            <Button type="primary" size="small" loading={batchReview.isPending}>
              批量接受
            </Button>
          </Popconfirm>
          <Popconfirm
            title={`确定拒绝 ${selectedRowKeys.length} 个候选?`}
            onConfirm={() => batchReview.mutate({ decision: "reject" })}
          >
            <Button danger size="small" loading={batchReview.isPending}>
              批量拒绝
            </Button>
          </Popconfirm>
          <Button size="small" type="link" onClick={() => setSelectedRowKeys([])}>
            清除选择
          </Button>
        </Space>
      )}

      <Table<MergeCandidateVo>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        columns={columns}
        rowSelection={{
          type: "checkbox",
          selectedRowKeys,
          preserveSelectedRowKeys: true,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
          showSizeChanger: true,
        }}
      />
    </Space>
  );
}
