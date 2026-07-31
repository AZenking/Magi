import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Flex, Result, Space, Tag, Typography } from "antd";
import type { ProColumns } from "@ant-design/pro-components";
import type { DeviceClient } from "@magi/types";
import {
  LaptopOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { PageHeader, PageStack } from "@/components/page-layout";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { useFeedback } from "@/lib/feedback";
import { useAccountDeviceClients } from "./client-queries";
import { RenameClientModal } from "./rename-client-modal";
import { RevokeClientModal } from "./revoke-client-modal";

const STATUS_META: Record<
  DeviceClient["status"],
  { label: string; color: string }
> = {
  online: { label: "在线", color: "success" },
  offline: { label: "离线", color: "default" },
  revoked: { label: "已撤销", color: "error" },
};

function formatDatetime(value: string | null) {
  if (!value) return "从未心跳";
  return new Date(value).toLocaleString();
}

export function ClientManagementPage() {
  const { message } = useFeedback();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [renaming, setRenaming] = useState<DeviceClient | null>(null);
  const [revoking, setRevoking] = useState<DeviceClient | null>(null);
  const renameTrigger = useRef<HTMLButtonElement | null>(null);
  const query = { page, pageSize } as const;
  const result = useAccountDeviceClients(query);
  const data = result.data?.data;
  const rows = data?.items ?? [];

  useEffect(() => {
    if (result.isError && data)
      message.warning("展示截至上次成功刷新的数据，刷新失败");
  }, [data, message, result.isError]);

  const refresh = useCallback(() => {
    void result.refetch();
  }, [result]);

  const columns = useMemo<ProColumns<DeviceClient>[]>(
    () => [
      { title: "名称", dataIndex: "displayName", ellipsis: true, width: 160 },
      {
        title: "设备",
        dataIndex: "identitySummary",
        ellipsis: true,
        render: (_, record) => (
          <Space>
            <LaptopOutlined />
            <span>{record.identitySummary}</span>
            <Typography.Text type="secondary">
              {record.deviceType}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "平台",
        dataIndex: "platform",
        width: 150,
        render: (_, record) => `${record.platform} ${record.platformVersion}`,
      },
      { title: "应用版本", dataIndex: "appVersion", width: 110 },
      {
        title: "首次注册",
        dataIndex: "registeredAt",
        width: 180,
        render: (_, record) => formatDatetime(record.registeredAt),
      },
      {
        title: "最后活跃",
        dataIndex: "lastActiveAt",
        width: 180,
        render: (_, record) => formatDatetime(record.lastActiveAt),
      },
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
        title: "操作",
        key: "actions",
        width: 180,
        fixed: "right",
        render: (_, record) =>
          record.status === "revoked" ? (
            <Typography.Text type="secondary">无可用操作</Typography.Text>
          ) : (
            <Space size="small">
              <Button
                size="small"
                onClick={(event) => {
                  renameTrigger.current = event.currentTarget;
                  setRenaming(record);
                }}
              >
                重命名
              </Button>
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={(event) => {
                  renameTrigger.current = event.currentTarget;
                  setRevoking(record);
                }}
              >
                撤销访问
              </Button>
            </Space>
          ),
      },
    ],
    [],
  );

  if (result.isError && !data) {
    return (
      <Result
        status="error"
        title="客户端列表加载失败"
        subTitle="请检查登录状态或服务状态后重试。"
        extra={
          <Button type="primary" onClick={refresh}>
            重试
          </Button>
        }
      />
    );
  }

  return (
    <PageStack>
      <PageHeader
        title="账户 · 客户端管理"
        description="查看自动登记设备的在线状态，并撤销不再使用的客户端。"
      />
      {result.isError && data ? (
        <Typography.Text type="warning">
          展示截至 {formatDatetime(data.asOf)} 的数据，刷新失败。
        </Typography.Text>
      ) : null}
      {data && rows.length === 0 && !result.isLoading ? (
        <Empty
          description={
            <Flex vertical gap={8}>
              <span>尚无已绑定客户端</span>
              <Typography.Text type="secondary">
                在 TV 上打开 MAGI，设备会自动登记到默认账户；完成后刷新此页面。
              </Typography.Text>
            </Flex>
          }
        />
      ) : (
        <ProTableWrapper
          columns={columns}
          dataSource={rows}
          rowKey="id"
          loading={result.isLoading}
          error={result.isError && !data ? result.error : null}
          onRetry={refresh}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            onChange: (next, size) => {
              setPage(next);
              setPageSize(size as 20 | 50 | 100);
            },
          }}
          toolBarRender={() => [
            <Button key="refresh" icon={<ReloadOutlined />} onClick={refresh}>
              刷新
            </Button>,
          ]}
          columnsStateKey="account-client-columns"
        />
      )}
      <RenameClientModal
        client={renaming}
        open={!!renaming}
        onClose={() => {
          setRenaming(null);
          renameTrigger.current?.focus();
        }}
      />
      <RevokeClientModal
        client={revoking}
        open={!!revoking}
        onClose={() => {
          setRevoking(null);
          renameTrigger.current?.focus();
        }}
      />
    </PageStack>
  );
}
