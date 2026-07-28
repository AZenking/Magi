/**
 * OperationPreview (T045).
 *
 * Reusable impact-summary + warnings/blockers + controlled confirmation UI for
 * the preview→confirm→apply flow. antd v6 visual language (T001): one primary
 * button per surface, token-driven semantic colors, 4px grid spacing.
 *
 * Never optimistically mutates channel/source data (FR-027): apply triggers a
 * mutation that shows a task badge until the task succeeds and the collection
 * is refetched.
 */
import { useState } from "react";
import { Alert, Button, Modal, Space, Spin, Statistic, Tag, Typography, theme } from "antd";
import { useApplyChangeSet, useCancelChangeSet, useChangeSet } from "./operation-queries";
import { OperationImpactTable } from "./operation-impact-table";

const { Title, Text } = Typography;

interface Summary {
  added?: number;
  updated?: number;
  missing?: number;
  deleted?: number;
  preserved?: number;
  conflicts?: number;
  unmatched?: number;
}

export function OperationPreview({
  changeSetId,
  onClose,
  onApplied,
}: {
  changeSetId: string;
  onClose?: () => void;
  /** Called with the apply task id once apply is accepted (task link UX). */
  onApplied?: (taskId: string) => void;
}) {
  const { token } = theme.useToken();
  const { data, isLoading } = useChangeSet(changeSetId);
  const apply = useApplyChangeSet();
  const cancel = useCancelChangeSet();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const summary: Summary = (data?.summary ?? {}) as Summary;
  const warnings: { code: string; message: string }[] = (data?.warnings ?? []) as never;
  const blockers: { code: string; message: string }[] = (data?.blockers ?? []) as never;
  const hasBlockers = blockers.length > 0;
  const status = data?.status as string | undefined;
  const version = data?.version ?? 0;

  const handleApply = async () => {
    const result = await apply.mutateAsync({
      changeSetId,
      version,
      // Stable per change set: a change set can only be applied once, so
      // retries/replays dedupe on the server (contracts/common.md).
      idempotencyKey: `apply-${changeSetId}`,
      confirmedWarningCodes: warnings.map((w) => w.code),
    });
    setConfirmOpen(false);
    onApplied?.(result.task.id);
    onClose?.();
  };

  return (
    <Space orientation="vertical" size={24} style={{ width: "100%" }}>
      <div>
        <Title level={4}>影响预览</Title>
        <Text type="secondary">预览不会改变当前输出；应用前可安全浏览。</Text>
      </div>

      {status === "preparing" && (
        <Space size={8}>
          <Spin size="small" />
          <Text type="secondary">正在计算影响范围…完成后自动刷新。</Text>
        </Space>
      )}

      <Space size={32} wrap>
        {summary.added != null && <Statistic title="新增" value={summary.added} />}
        {summary.updated != null && <Statistic title="更新" value={summary.updated} />}
        {summary.missing != null && <Statistic title="缺失" value={summary.missing} />}
        {summary.preserved != null && <Statistic title="保留" value={summary.preserved} />}
        {summary.conflicts != null && (
          <Statistic
            title="冲突"
            value={summary.conflicts}
            styles={{ content: summary.conflicts > 0 ? { color: token.colorError } : undefined }}
          />
        )}
      </Space>

      {blockers.map((b) => (
        <Alert
          key={b.code}
          type="error"
          showIcon
          title={`阻断：${b.code}`}
          description={b.message}
        />
      ))}

      {warnings.map((w) => (
        <Alert
          key={w.code}
          type="warning"
          showIcon
          title={`警告：${w.code}`}
          description={w.message}
        />
      ))}

      {!isLoading && <OperationImpactTable changeSetId={changeSetId} />}

      <Space>
        <Button
          onClick={() => cancel.mutate({ changeSetId, version })}
          disabled={status !== "ready" && status !== "preparing"}
          loading={cancel.isPending}
        >
          取消预览
        </Button>
        <Button
          type="primary"
          disabled={hasBlockers || status !== "ready" || apply.isPending}
          loading={apply.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          应用变更
        </Button>
        {hasBlockers && <Tag color="error">存在阻断项，无法应用</Tag>}
      </Space>

      <Modal
        title="确认应用变更"
        open={confirmOpen}
        onOk={handleApply}
        onCancel={() => setConfirmOpen(false)}
        okText="确认应用"
        cancelText="再看看"
        okButtonProps={{ loading: apply.isPending }}
        mask={{ closable: false }}
      >
        <Text>应用将改变当前运营状态。操作前已创建恢复点，可在任务结果或审计记录中恢复。</Text>
      </Modal>
    </Space>
  );
}
