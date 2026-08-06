import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Input,
  Popconfirm,
  Result,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
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
import {
  useAccountDeviceClient,
  useAccountDeviceClients,
  useRestoreDeviceClient,
} from "./client-queries";
import { RenameClientModal } from "./rename-client-modal";
import { RevokeClientModal } from "./revoke-client-modal";
import { formatApiError } from "@/services/api";

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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DeviceClient["status"] | undefined>();
  const renameTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreMutation = useRestoreDeviceClient();
  const detailResult = useAccountDeviceClient(detailId, !!detailId);
  const query = { page, pageSize, search: search || undefined, status } as const;
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
        width: 300,
        fixed: "right",
        render: (_, record) => (
          <Space size="small" wrap>
            <Button size="small" onClick={() => setDetailId(record.id)}>
              详情
            </Button>
            {record.status === "revoked" ? (
              <Popconfirm
                title="允许客户端重新登记？"
                description="这会解除撤销状态；设备下次登记时会重新轮换凭证。"
                okText="解除撤销"
                cancelText="取消"
                onConfirm={() => {
                  restoreMutation.mutate(record.id, {
                    onSuccess: () => message.success("已允许重新登记"),
                    onError: (error) =>
                      message.error(formatApiError(error, "解除撤销失败")),
                  });
                }}
              >
                <Button size="small" loading={restoreMutation.isPending}>
                  允许重新登记
                </Button>
              </Popconfirm>
            ) : (
              <>
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
              </>
            )}
          </Space>
        ),
      },
    ],
    [message, restoreMutation],
  );

  if (result.isError && !data) {
    return (
      <Result
        status="error"
        title="客户端列表加载失败"
        subTitle={formatApiError(result.error, "请检查登录状态或服务状态后重试。")}
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
            <Input.Search
              key="search"
              allowClear
              value={searchInput}
              placeholder="搜索名称、设备、平台或版本"
              onChange={(event) => setSearchInput(event.target.value)}
              onSearch={(value) => {
                setPage(1);
                setSearch(value.trim());
              }}
              style={{ width: 240 }}
            />,
            <Select
              key="status"
              allowClear
              placeholder="状态"
              value={status}
              onChange={(value) => {
                setPage(1);
                setStatus(value);
              }}
              options={Object.entries(STATUS_META).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
              style={{ width: 120 }}
            />,
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
      <Drawer
        title="客户端心跳诊断"
        open={!!detailId}
        onClose={() => setDetailId(null)}
        width={440}
      >
        {detailResult.isLoading ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : detailResult.isError ? (
          <Typography.Text type="danger">
            {formatApiError(detailResult.error, "详情加载失败")}
          </Typography.Text>
        ) : detailResult.data?.data ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="名称">
              {detailResult.data.data.displayName}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {STATUS_META[detailResult.data.data.status].label}
            </Descriptions.Item>
            <Descriptions.Item label="设备">
              {detailResult.data.data.identitySummary}
            </Descriptions.Item>
            <Descriptions.Item label="平台">
              {detailResult.data.data.platform} {detailResult.data.data.platformVersion}
            </Descriptions.Item>
            <Descriptions.Item label="应用版本">
              {detailResult.data.data.appVersion}
            </Descriptions.Item>
            <Descriptions.Item label="首次注册">
              {formatDatetime(detailResult.data.data.registeredAt)}
            </Descriptions.Item>
            <Descriptions.Item label="最后心跳">
              {formatDatetime(detailResult.data.data.lastActiveAt)}
            </Descriptions.Item>
            <Descriptions.Item label="心跳规则">
              每 60 秒一次；最近 150 秒内视为在线
            </Descriptions.Item>
            <Descriptions.Item label="撤销时间">
              {formatDatetime(detailResult.data.data.revokedAt)}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </PageStack>
  );
}
