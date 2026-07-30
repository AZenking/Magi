/**
 * ApiKeysPage — API key management (005-open-channels-epg-api, US1).
 *
 * Lists keys (GET /api/admin/api-keys, never plaintext), creates new keys
 * (POST) and shows the generated plaintext ONCE in a modal with a copy button.
 * Disable/enable/revoke/delete actions land here in US5 (T046).
 *
 * antd v6 visual language: token colors, 4px grid, single primary action.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Form, Input, Modal, Popconfirm, Space, Tag, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import type { ApiKeyCreatedVo, ApiKeyVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/api-keys")({
  component: ApiKeysPage,
});

interface Envelope<T> {
  success: boolean;
  data: T;
}

const STATUS_META: Record<ApiKeyVo["status"], { label: string; color: string }> = {
  active: { label: "启用", color: "success" },
  disabled: { label: "已禁用", color: "default" },
  revoked: { label: "已吊销", color: "error" },
};

function formatDatetime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ApiKeysPage() {
  const { message } = useFeedback();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreatedVo | null>(null);
  const [createForm] = Form.useForm<{ name: string; expiresAt?: string }>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["api-keys", page, pageSize],
    queryFn: () =>
      apiClient<Envelope<PaginatedResponse<ApiKeyVo>>>("/api/admin/api-keys", {
        params: { page, pageSize },
      }),
  });

  const keys = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: (values: { name: string; expiresAt?: string }) =>
      apiClient<Envelope<ApiKeyCreatedVo>>("/api/admin/api-keys", {
        method: "POST",
        body: values.expiresAt ? values : { name: values.name },
      }),
    onSuccess: (res) => {
      setCreateOpen(false);
      setCreated(res.data);
      createForm.resetFields();
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      message.success("API key 已创建");
    },
    onError: () => {
      message.error("创建失败");
    },
  });

  const runAction = async (
    id: string,
    action: "disable" | "enable" | "revoke" | "delete",
  ) => {
    const suffix = action === "delete" ? "" : `/${action}`;
    const method = action === "delete" ? "DELETE" : "POST";
    try {
      await apiClient<Envelope<ApiKeyVo | null>>(`/api/admin/api-keys/${id}${suffix}`, {
        method,
      });
      message.success("操作成功");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    } catch {
      message.error("操作失败");
    }
  };

  const columns: ProColumns<ApiKeyVo>[] = [
    { title: "名称", dataIndex: "name", ellipsis: true },
    { title: "Key 前缀", dataIndex: "keyPrefix", width: 140 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (_, record) => {
        const meta = STATUS_META[record.status];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: "最后使用",
      dataIndex: "lastUsedAt",
      width: 180,
      render: (_, record) => formatDatetime(record.lastUsedAt),
    },
    {
      title: "过期时间",
      dataIndex: "expiresAt",
      width: 180,
      render: (_, record) => formatDatetime(record.expiresAt),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 180,
      render: (_, record) => formatDatetime(record.createdAt),
    },
    {
      title: "操作",
      key: "actions",
      width: 200,
      fixed: "right",
      render: (_, record) => (
        <Space size="small">
          {record.status === "active" && (
            <Button size="small" onClick={() => runAction(record.id, "disable")}>
              禁用
            </Button>
          )}
          {record.status === "disabled" && (
            <Button size="small" onClick={() => runAction(record.id, "enable")}>
              启用
            </Button>
          )}
          {record.status !== "revoked" && (
            <Popconfirm
              title="永久吊销该 Key？"
              description="吊销后不可恢复，使用该 Key 的客户端将立即无法访问。"
              okText="吊销"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => runAction(record.id, "revoke")}
            >
              <Button size="small" danger icon={<StopOutlined />}>
                吊销
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="删除该 Key？"
            description="物理删除，记录将被移除。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => runAction(record.id, "delete")}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageStack>
      <PageHeader
        title="开放接口 · API Keys"
        description="签发外部客户端访问频道与节目单的只读凭据。明文仅创建时显示一次。"
      />
      <ProTableWrapper<ApiKeyVo>
        columns={columns}
        dataSource={keys}
        loading={isLoading}
        error={error ?? null}
        onRetry={() => refetch()}
        rowKey="id"
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建 Key
          </Button>,
        ]}
      />

      {/* Create modal */}
      <Modal
        title="新建 API Key"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values)}
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: "请输入名称", min: 1, max: 120 }]}
          >
            <Input placeholder="如：客厅电视、导出脚本" autoFocus />
          </Form.Item>
          <Form.Item
            name="expiresAt"
            label="过期时间（可选，留空=长期）"
            tooltip="ISO 8601 格式，如 2026-12-31T23:59:59+08:00"
          >
            <Input placeholder="2026-12-31T23:59:59+08:00" />
          </Form.Item>
        </Form>
      </Modal>

      {/* One-time plaintext display */}
      <Modal
        title="API Key 已创建"
        open={!!created}
        onCancel={() => setCreated(null)}
        onOk={() => setCreated(null)}
        okText="我已复制保存"
        cancelText="关闭"
        cancelButtonProps={{ style: { display: "none" } }}
        maskClosable={false}
      >
        {created && (
          <>
            <Typography.Paragraph type="warning" strong>
              请立即复制保存。关闭后明文将无法再次获取。
            </Typography.Paragraph>
            <Typography.Paragraph copyable={{ text: created.key }}>
              <Typography.Text code>{created.key}</Typography.Text>
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              前缀 {created.keyPrefix} · 名称「{created.name}」
            </Typography.Text>
          </>
        )}
      </Modal>
    </PageStack>
  );
}
