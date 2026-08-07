/**
 * OutputGrantManagement (009-m3u-control-plane T052).
 *
 * Lists existing grants for the current operator, supports create / rotate /
 * revoke, shows the one-time plaintext on create/rotate, and surfaces the
 * publication projection (fresh/stale/blocked + counts).
 *
 * antd v6 visual language: one primary action per surface, semantic Tag
 * colors, 4px grid spacing. The plaintext reveal uses a Modal with an
 * explicit "I have copied the URL" close button so the dialog doesn't dismiss
 * on accidental clicks.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  OutputGrantIssuedVo,
  OutputGrantSummaryVo,
  OutputPublicationVo,
} from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";

const { Title, Text, Paragraph } = Typography;

interface Envelope<T> {
  success: boolean;
  data: T;
}

const statusColor: Record<OutputGrantSummaryVo["status"], string> = {
  active: "green",
  revoked: "red",
  expired: "orange",
};

const publicationColor: Record<OutputPublicationVo["status"], string> = {
  fresh: "green",
  stale: "orange",
  blocked: "red",
};

const publicationLabel: Record<OutputPublicationVo["status"], string> = {
  fresh: "最新",
  stale: "陈旧（沿用上次目录）",
  blocked: "阻塞（无可用目录）",
};

export function OutputGrantManagement() {
  const { notification } = useFeedback();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [reveal, setReveal] = useState<OutputGrantIssuedVo | null>(null);
  const [form] = Form.useForm<{
    displayName: string;
    profile: "primary" | "all";
    expiresInDays: number | null;
  }>();

  const grantsQuery = useQuery({
    queryKey: ["output-grants"],
    queryFn: async () => {
      const res = await apiClient<Envelope<{ items: OutputGrantSummaryVo[] }>>(
        "/output/grants",
      );
      return res.data;
    },
  });

  const publicationQuery = useQuery({
    queryKey: ["output-publication"],
    queryFn: async () => {
      const res = await apiClient<Envelope<OutputPublicationVo>>(
        "/output/publication",
      );
      return res.data;
    },
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      displayName: string;
      profile: "primary" | "all";
      expiresInDays: number | null;
    }) => {
      const expiresAt =
        input.expiresInDays != null
          ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null;
      const res = await apiClient<Envelope<OutputGrantIssuedVo>>("/output/grants", {
        method: "POST",
        body: {
          displayName: input.displayName,
          profile: input.profile,
          expiresAt,
        },
      });
      return res.data;
    },
    onSuccess: async (data) => {
      setCreateOpen(false);
      setReveal(data);
      form.resetFields();
      await qc.invalidateQueries({ queryKey: ["output-grants"] });
      message.success("已签发新的输出资格");
    },
    onError: (err: unknown) => {
      notification.error({
        title: "签发失败",
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient<Envelope<OutputGrantIssuedVo>>(
        `/output/grants/${id}/rotate`,
        { method: "POST" },
      );
      return res.data;
    },
    onSuccess: async (data) => {
      setReveal(data);
      await qc.invalidateQueries({ queryKey: ["output-grants"] });
      message.success("已轮换,旧 URL 立即失效");
    },
    onError: (err: unknown) => {
      notification.error({
        title: "轮换失败",
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (input: { id: string; reason: string | null }) => {
      const res = await apiClient<Envelope<OutputGrantSummaryVo>>(
        `/output/grants/${input.id}/revoke`,
        { method: "POST", body: { reason: input.reason } },
      );
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["output-grants"] });
      message.success("已撤销,该资格立即失效");
    },
    onError: (err: unknown) => {
      notification.error({
        title: "撤销失败",
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    },
  });

  const columns: ColumnsType<OutputGrantSummaryVo> = [
    {
      title: "显示名",
      dataIndex: "displayName",
      key: "displayName",
    },
    {
      title: "Profile",
      dataIndex: "profile",
      key: "profile",
      render: (p: OutputGrantSummaryVo["profile"]) => (
        <Tag color={p === "all" ? "blue" : "default"}>{p === "all" ? "全频道" : "主线路"}</Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (s: OutputGrantSummaryVo["status"]) => (
        <Tag color={statusColor[s]}>{s}</Tag>
      ),
    },
    {
      title: "Token 前缀",
      dataIndex: "tokenPrefix",
      key: "tokenPrefix",
      render: (p: string) => <Text code>{p}…</Text>,
    },
    {
      title: "最近使用",
      dataIndex: "lastUsedAt",
      key: "lastUsedAt",
      render: (v: string | null) =>
        v ? new Date(v).toLocaleString() : <Text type="secondary">—</Text>,
    },
    {
      title: "到期",
      dataIndex: "expiresAt",
      key: "expiresAt",
      render: (v: string | null) =>
        v ? new Date(v).toLocaleDateString() : <Text type="secondary">永不</Text>,
    },
    {
      title: "操作",
      key: "actions",
      render: (_, record) => (
        <Space size={4}>
          <Button
            size="small"
            disabled={record.status !== "active"}
            loading={rotateMutation.isPending}
            onClick={() => rotateMutation.mutate(record.id)}
          >
            轮换
          </Button>
          <Popconfirm
            title="撤销此后该资格将立即失效,且无法恢复。"
            description="确定撤销?"
            okText="撤销"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() =>
              revokeMutation.mutate({ id: record.id, reason: "Operator revoked from UI" })
            }
            disabled={record.status !== "active"}
          >
            <Button
              size="small"
              danger
              disabled={record.status !== "active"}
              loading={revokeMutation.isPending}
            >
              撤销
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const publication = publicationQuery.data;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Space style={{ justifyContent: "space-between", width: "100%" }}>
          <div>
            <Title level={5} style={{ margin: 0 }}>
              当前输出状态
            </Title>
            <Text type="secondary">动态生成,无文件落盘</Text>
          </div>
          {publication && (
            <Space size={16}>
              <Tag color={publicationColor[publication.status]}>
                {publicationLabel[publication.status]}
              </Tag>
              <Text>
                频道 <strong>{publication.channelCount}</strong> · 可播放{" "}
                <strong>{publication.playableChannelCount}</strong> · 排除{" "}
                <strong>{publication.excludedChannelCount}</strong>
              </Text>
              {publication.blockingReason && (
                <Text type="secondary">{publication.blockingReason}</Text>
              )}
            </Space>
          )}
        </Space>
      </Card>

      <Card
        size="small"
        title="输出资格 (Grants)"
        extra={
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            签发新资格
          </Button>
        }
      >
        <Table<OutputGrantSummaryVo>
          rowKey="id"
          loading={grantsQuery.isLoading}
          dataSource={grantsQuery.data?.items ?? []}
          columns={columns}
          pagination={false}
        />
      </Card>

      <Modal
        title="签发新输出资格"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        okText="签发"
        cancelText="取消"
        okButtonProps={{ loading: createMutation.isPending }}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values)}
          initialValues={{ profile: "primary", expiresInDays: null }}
        >
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, min: 1, max: 120 }]}
          >
            <Input placeholder="如:客厅电视" />
          </Form.Item>
          <Form.Item name="profile" label="频道范围">
            <Select
              options={[
                { value: "primary", label: "仅主线路 (primary)" },
                { value: "all", label: "全部线路 (all)" },
              ]}
            />
          </Form.Item>
          <Form.Item name="expiresInDays" label="有效天数 (留空=永不)">
            <InputNumber min={1} max={3650} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="复制输出 URL — 仅此一次显示"
        open={!!reveal}
        onCancel={() => setReveal(null)}
        footer={[
          <Button key="copied" type="primary" onClick={() => setReveal(null)}>
            我已复制
          </Button>,
        ]}
        maskClosable={false}
      >
        {reveal && (
          <Space direction="vertical" size={12}>
            <Alert
              type="warning"
              showIcon
              message="关闭后将无法再次获取该 URL;丢失只能轮换或重新签发。"
            />
            <Paragraph copyable={{ text: reveal.playlistUrl }}>
              <Text code style={{ wordBreak: "break-all" }}>
                {reveal.playlistUrl}
              </Text>
            </Paragraph>
            <Text type="secondary">
              Token 前缀 <Text code>{reveal.grant.tokenPrefix}…</Text> · 状态{" "}
              <Tag color={statusColor[reveal.grant.status]}>
                {reveal.grant.status}
              </Tag>
            </Text>
          </Space>
        )}
      </Modal>
    </Space>
  );
}
