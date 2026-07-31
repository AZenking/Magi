/**
 * OauthClientsPage — OAuth2 client credential management (004-safe-operations).
 *
 * Lists registered clients (GET /api/admin/oauth-clients, never plaintext),
 * creates new clients (POST, shows the generated secret ONCE in a modal with
 * a copy button), and supports disable/enable/revoke/delete actions.
 *
 * disable vs revoke:
 *   disable — reversible pause; existing tokens keep working but no new tokens
 *             can be issued. Use for temporary access restriction.
 *   revoke  — permanent; ALL issued tokens are instantly invalidated. Use for
 *             device loss or credential compromise.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Form, Input, Modal, Popconfirm, Space, Tag, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import type { OauthClientCreatedVo, OauthClientVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/oauth-clients")({
  component: OauthClientsPage,
});

interface Envelope<T> {
  success: boolean;
  data: T;
}

const STATUS_META: Record<OauthClientVo["status"], { label: string; color: string }> = {
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

function OauthClientsPage() {
  const { message } = useFeedback();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<OauthClientCreatedVo | null>(null);
  const [createForm] = Form.useForm<{ clientId: string; clientName: string }>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["oauth-clients", page, pageSize],
    queryFn: () =>
      apiClient<Envelope<PaginatedResponse<OauthClientVo>>>("/api/admin/oauth-clients", {
        params: { page, pageSize },
      }),
  });

  const clients = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: (values: { clientId: string; clientName: string }) =>
      apiClient<Envelope<OauthClientCreatedVo>>("/api/admin/oauth-clients", {
        method: "POST",
        body: values,
      }),
    onSuccess: (res) => {
      setCreateOpen(false);
      setCreated(res.data);
      createForm.resetFields();
      qc.invalidateQueries({ queryKey: ["oauth-clients"] });
      message.success("客户端已创建");
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
      await apiClient<Envelope<OauthClientVo | null>>(`/api/admin/oauth-clients/${id}${suffix}`, {
        method,
      });
      message.success("操作成功");
      qc.invalidateQueries({ queryKey: ["oauth-clients"] });
    } catch {
      message.error("操作失败");
    }
  };

  const columns: ProColumns<OauthClientVo>[] = [
    { title: "名称", dataIndex: "clientName", ellipsis: true },
    { title: "Client ID", dataIndex: "clientId", ellipsis: true, width: 200 },
    { title: "Secret 前缀", dataIndex: "secretPrefix", width: 120 },
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
      title: "创建时间",
      dataIndex: "createdAt",
      width: 180,
      render: (_, record) => formatDatetime(record.createdAt),
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      fixed: "right",
      render: (_, record) => (
        <Space size="small">
          {record.status === "active" && (
            <Button size="small" onClick={() => runAction(record.id, "disable")}>
              禁用
            </Button>
          )}
          {record.status === "disabled" && (
            <Button size="small" type="primary" onClick={() => runAction(record.id, "enable")}>
              启用
            </Button>
          )}
          {record.status !== "revoked" && (
            <Popconfirm
              title="永久吊销该客户端？"
              description="吊销后不可恢复，所有已签发的 token 立即失效，关联设备将无法访问。"
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
            title="删除该客户端？"
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
        title="开放接口 · 客户端凭证"
        description="管理通过 Client Credentials Grant 访问频道与节目单的客户端。明文 Secret 仅创建时显示一次。"
      />
      <ProTableWrapper<OauthClientVo>
        columns={columns}
        dataSource={clients}
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
            新建客户端
          </Button>,
        ]}
      />

      {/* Create modal */}
      <Modal
        title="新建客户端"
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
            name="clientId"
            label="Client ID"
            rules={[
              { required: true, message: "请输入 Client ID", min: 1, max: 64 },
              {
                pattern: /^[a-zA-Z0-9_-]+$/,
                message: "仅允许字母、数字、下划线和连字符",
              },
            ]}
          >
            <Input placeholder="如：magi_tv_android" autoFocus />
          </Form.Item>
          <Form.Item
            name="clientName"
            label="名称"
            rules={[{ required: true, message: "请输入名称", min: 1, max: 120 }]}
          >
            <Input placeholder="如：客厅电视、导出脚本" />
          </Form.Item>
        </Form>
      </Modal>

      {/* One-time plaintext secret display */}
      <Modal
        title="客户端已创建"
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
              请立即复制保存 Client Secret。关闭后将无法再次获取。
            </Typography.Paragraph>
            <Typography.Paragraph>
              <Typography.Text strong>Client ID：</Typography.Text>
              <Typography.Text copyable={{ text: created.clientId }} code>
                {created.clientId}
              </Typography.Text>
            </Typography.Paragraph>
            <Typography.Paragraph copyable={{ text: created.clientSecret }}>
              <Typography.Text strong>Client Secret：</Typography.Text>
              <Typography.Text code>{created.clientSecret}</Typography.Text>
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              前缀 {created.secretPrefix} · 名称「{created.clientName}」
            </Typography.Text>
          </>
        )}
      </Modal>
    </PageStack>
  );
}
