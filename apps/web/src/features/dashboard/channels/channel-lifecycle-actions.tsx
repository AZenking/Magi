import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { CanonicalChannelVo, ChannelLifecycle } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import { Button, Flex, Modal, Tag, Typography, theme } from "antd";
import {
  DeleteOutlined,
  EyeInvisibleOutlined,
  RestOutlined,
  StopOutlined,
  UndoOutlined,
} from "@ant-design/icons";

/** Lifecycle display map shared by list columns and detail page (T060). */
export const lifecycleMap: Record<
  ChannelLifecycle,
  { label: string; color?: string }
> = {
  active: { label: "输出中", color: "success" },
  hidden: { label: "已隐藏" },
  disabled: { label: "已禁用", color: "warning" },
  trashed: { label: "回收站", color: "error" },
};

export function formatPurgeAfter(purgeAfter: string | null | undefined) {
  if (!purgeAfter) return "—";
  return new Date(purgeAfter).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Reversible single-channel transition (POST lifecycle, If-Match version). */
export async function changeChannelLifecycle(
  channel: Pick<CanonicalChannelVo, "id" | "version">,
  target: ChannelLifecycle,
  reason?: string,
) {
  return apiClient<{
    success: boolean;
    data: { previous: string; current: string; purgeAfter: string | null; version: number };
  }>(`/output/channels/${channel.id}/lifecycle`, {
    method: "POST",
    headers: { "If-Match": `"${channel.version ?? 1}"` },
    body: { target, ...(reason ? { reason } : {}) },
  });
}

interface PendingBatch {
  target: ChannelLifecycle | "purge";
  title: string;
  danger: boolean;
}

interface ChannelLifecycleActionsProps {
  /** Selected channels (stable IDs + names; never row indexes, FR-015). */
  channels: CanonicalChannelVo[];
  /** Lifecycle tab currently displayed (all selected rows share it). */
  currentLifecycle: ChannelLifecycle;
  onDone: () => void;
  onClearSelection: () => void;
}

/**
 * Batch lifecycle toolbar (T060): renders the transitions allowed from the
 * current tab and confirms with the actual channel-name list. Trash/purge
 * confirmations also surface each channel's purgeAfter (FR-013/FR-016).
 */
export function ChannelLifecycleActions({
  channels,
  currentLifecycle,
  onDone,
  onClearSelection,
}: ChannelLifecycleActionsProps) {
  const { message } = useFeedback();
  const { token } = theme.useToken();
  const [pending, setPending] = useState<PendingBatch | null>(null);

  const batchMutation = useMutation({
    mutationFn: async (target: ChannelLifecycle) => {
      const results = await Promise.allSettled(
        channels.map((ch) => changeChannelLifecycle(ch, target)),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { failed, total: results.length };
    },
    onSuccess: ({ failed, total }) => {
      if (failed > 0) {
        message.warning(`${total - failed}/${total} 个频道已更新，${failed} 个失败（可能已被他人修改，请刷新）`);
      } else {
        message.success(`已更新 ${total} 个频道`);
      }
      onDone();
    },
    onError: (err) => message.error(`批量操作失败：${err.message}`),
  });

  const purgeMutation = useMutation({
    mutationFn: async () =>
      apiClient<{ success: boolean; data: { updated: number } }>(
        "/output/channels/batch",
        { method: "POST", body: { ids: channels.map((c) => c.id), action: "delete" } },
      ),
    onSuccess: () => {
      message.success(`已永久删除 ${channels.length} 个频道`);
      onDone();
    },
    onError: (err) => message.error(`删除失败：${err.message}`),
  });

  const busy = batchMutation.isPending || purgeMutation.isPending;

  const confirm = (target: ChannelLifecycle | "purge", title: string, danger = false) =>
    setPending({ target, title, danger });

  const execute = () => {
    if (!pending) return;
    if (pending.target === "purge") {
      purgeMutation.mutate();
    } else {
      batchMutation.mutate(pending.target);
    }
    setPending(null);
  };

  return (
    <>
      <Flex
        align="center"
        wrap
        gap={token.marginSM}
        style={{
          borderRadius: token.borderRadiusLG,
          border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
          background: token.colorFillAlter,
          padding: `${token.paddingXS}px ${token.paddingSM}px`,
        }}
      >
        <span style={{ color: token.colorTextSecondary }}>
          已选 {channels.length} 个频道
        </span>
        {currentLifecycle !== "active" && (
          <Button
            size="small"
            icon={<UndoOutlined />}
            disabled={busy}
            onClick={() => confirm("active", "恢复输出")}
          >
            恢复输出
          </Button>
        )}
        {currentLifecycle !== "hidden" && currentLifecycle !== "trashed" && (
          <Button
            size="small"
            icon={<EyeInvisibleOutlined />}
            disabled={busy}
            onClick={() => confirm("hidden", "隐藏")}
          >
            隐藏
          </Button>
        )}
        {currentLifecycle !== "disabled" && currentLifecycle !== "trashed" && (
          <Button
            size="small"
            icon={<StopOutlined />}
            disabled={busy}
            onClick={() => confirm("disabled", "禁用")}
          >
            禁用
          </Button>
        )}
        {currentLifecycle !== "trashed" ? (
          <Button
            danger
            size="small"
            icon={<RestOutlined />}
            disabled={busy}
            onClick={() => confirm("trashed", "移入回收站", true)}
          >
            移入回收站
          </Button>
        ) : (
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            disabled={busy}
            onClick={() => confirm("purge", "永久删除", true)}
          >
            永久删除
          </Button>
        )}
        <Button type="text" size="small" onClick={onClearSelection}>
          取消选择
        </Button>
      </Flex>

      <Modal
        open={!!pending}
        title={`确认${pending?.title ?? ""}`}
        okText={pending?.title}
        okButtonProps={{ danger: pending?.danger, loading: busy }}
        cancelText="取消"
        onCancel={() => setPending(null)}
        onOk={execute}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Flex vertical gap={token.marginXS}>
          <Typography.Text>
            将对以下 {channels.length} 个频道执行「{pending?.title}」：
          </Typography.Text>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {channels.map((ch) => (
              <Flex key={ch.id} align="center" gap={token.marginXS} wrap>
                <Typography.Text strong>{ch.standardName}</Typography.Text>
                {currentLifecycle === "trashed" && (
                  <Typography.Text type="secondary">
                    可清除时间：{formatPurgeAfter(ch.purgeAfter)}
                  </Typography.Text>
                )}
              </Flex>
            ))}
          </div>
          {pending?.target === "trashed" && (
            <Typography.Text type="secondary">
              回收站中的频道将在 30 天后可被永久清除，期间可随时恢复。
            </Typography.Text>
          )}
          {pending?.target === "purge" && (
            <Tag color="error">此操作不可撤销，频道配置、EPG 绑定与线路历史将一并删除。</Tag>
          )}
        </Flex>
      </Modal>
    </>
  );
}
