import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Empty,
  Flex,
  Input,
  Modal,
  Result,
  Typography,
  theme,
} from "antd";
import { ProList } from "@ant-design/pro-components";
import { LockOutlined } from "@ant-design/icons";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { apiClient } from "@/services/api";
import type { PaginatedResponse, RawXmltvChannelVo } from "@magi/types";

interface EpgMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEpgChannelId: string | null;
  /** Current manual-lock state (T073): locked bindings survive auto-matching. */
  manualLocked?: boolean;
  /** XMLTV source id bound to this channel (for display + binding context). */
  xmltvSourceId?: string | null;
  onSelect: (candidate: RawXmltvChannelVo, locked: boolean) => Promise<void>;
  onClear: () => Promise<void>;
  pending?: boolean;
}

export function EpgMatchDialog({
  open,
  onOpenChange,
  currentEpgChannelId,
  manualLocked,
  xmltvSourceId,
  onSelect,
  onClear,
  pending,
}: EpgMatchDialogProps) {
  const { token } = theme.useToken();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lockManual, setLockManual] = useState(manualLocked ?? false);
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["epg-channels", debouncedSearch, page],
    queryFn: () =>
      apiClient<{
        success: boolean;
        data: PaginatedResponse<RawXmltvChannelVo>;
      }>("/epg/channels", {
        params: { search: debouncedSearch || undefined, page, pageSize: 10 },
      }),
    enabled: open,
  });

  const candidates = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 0;

  return (
    <Modal
      open={open}
      title="EPG 频道匹配"
      onCancel={() => onOpenChange(false)}
      footer={null}
      width={560}
      destroyOnHidden
    >
      <Flex vertical gap={token.marginMD}>
        {currentEpgChannelId && (
          <Flex
            wrap
            align="center"
            justify="space-between"
            gap={token.marginXS}
            style={{
              border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadius,
              padding: `${token.paddingXS}px ${token.paddingSM}px`,
            }}
          >
            <Flex vertical gap={token.marginXXS}>
              <Typography.Text>
                当前绑定：
                <Typography.Text code>{currentEpgChannelId}</Typography.Text>
              </Typography.Text>
              {xmltvSourceId && (
                <Typography.Text type="secondary">
                  XMLTV 来源：{xmltvSourceId}
                </Typography.Text>
              )}
              {manualLocked && (
                <Typography.Text type="warning">
                  <LockOutlined /> 已锁定人工绑定（自动匹配不会覆盖）
                </Typography.Text>
              )}
            </Flex>
            <Button size="small" onClick={onClear} loading={pending}>
              清空绑定
            </Button>
          </Flex>
        )}

        <ProList<RawXmltvChannelVo>
          rowKey="id"
          headerTitle="XMLTV 候选频道"
          toolBarRender={() => [
            <Input
              key="search"
              placeholder="搜索频道 ID 或名称…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              autoComplete="off"
              allowClear
              style={{ width: 220 }}
            />,
          ]}
          dataSource={candidates}
          loading={isLoading}
          style={{ maxHeight: 320, overflowY: "auto" }}
          locale={{
            emptyText: isError ? (
              <Result
                status="error"
                title="频道候选加载失败"
                extra={<Button onClick={() => void refetch()}>重试</Button>}
              />
            ) : (
              <Empty description="无结果" />
            ),
          }}
          metas={{
            title: {
              render: (_, candidate) => (
                <Typography.Text code>{candidate.xmltvId}</Typography.Text>
              ),
            },
            description: {
              render: (_, candidate) => candidate.displayName,
            },
            actions: {
              render: (_, candidate) => [
                <Button
                  key="select"
                  type="link"
                  loading={pending}
                  onClick={() => onSelect(candidate, lockManual)}
                >
                  选择
                </Button>,
              ],
            },
          }}
          pagination={{
            current: page,
            pageSize: 10,
            total: totalPages * 10,
            onChange: (p) => setPage(p),
            size: "small",
            style: { textAlign: "center" },
          }}
        />

        {/* T073: manual lock — survives automatic matching (FR-005). */}
        <Checkbox
          checked={lockManual}
          onChange={(e) => setLockManual(e.target.checked)}
        >
          <LockOutlined /> 锁定人工绑定
        </Checkbox>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          锁定后，自动匹配将保留此绑定；清空时会一并解除锁定。
        </Typography.Text>
      </Flex>
    </Modal>
  );
}
