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
import { Alert, Button, Modal, Space, Spin, Tag, Typography, theme } from "antd";
import { StatisticCard } from "@ant-design/pro-components";

import { useApplyChangeSet, useCancelChangeSet, useChangeSet } from "./operation-queries";
import { OperationImpactTable } from "./operation-impact-table";
import { InlineSkeleton } from "@/components/page-skeleton";

const { Title, Text } = Typography;

interface Summary {
  added?: number;
  updated?: number;
  missing?: number;
  deleted?: number;
  preserved?: number;
  conflicts?: number;
  unmatched?: number;
  rawChannels?: number;
  channels?: number;
  programmes?: number;
  epgMappings?: number;
  canonicalMemberships?: number;
  streams?: number;
  schedules?: number;
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
  const warnings: { code: string; message: string; deletionRatio?: number }[] = (data?.warnings ?? []) as never;
  const blockers: { code: string; message: string }[] = (data?.blockers ?? []) as never;
  const hasBlockers = blockers.length > 0;
  const status = data?.status as string | undefined;
  const version = data?.version ?? 0;
  // 009-m3u-control-plane: anomaly classification drives the explicit
  // confirmation banner + disabled apply button when requiresConfirmation=true.
  const requiresConfirmation = data?.requiresConfirmation === true;
  const anomalyWarnings = data?.anomalyClassification?.warnings ?? [];
  const hasAnomaly = anomalyWarnings.length > 0 || requiresConfirmation;

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
          <InlineSkeleton />
          <Text type="secondary">正在计算影响范围…完成后自动刷新。</Text>
        </Space>
      )}

      <StatisticCard.Group>
        {summary.added != null && (
          <StatisticCard
            statistic={{ title: "新增", value: summary.added, description: "" }}
          />
        )}
        {summary.updated != null && (
          <StatisticCard
            statistic={{ title: "更新", value: summary.updated, description: "" }}
          />
        )}
        {summary.missing != null && (
          <StatisticCard
            statistic={{ title: "缺失", value: summary.missing, description: "" }}
          />
        )}
        {summary.preserved != null && (
          <StatisticCard
            statistic={{ title: "保留", value: summary.preserved, description: "" }}
          />
        )}
        {summary.conflicts != null && (
          <StatisticCard
            statistic={{
              title: "冲突",
              value: summary.conflicts,
              description: "",
              valueStyle:
                summary.conflicts > 0
                  ? { color: token.colorError }
                  : undefined,
            }}
          />
        )}
        {summary.rawChannels != null && (
          <StatisticCard
            statistic={{ title: "原始频道", value: summary.rawChannels, description: "" }}
          />
        )}
        {summary.channels != null && (
          <StatisticCard
            statistic={{ title: "标准频道", value: summary.channels, description: "" }}
          />
        )}
        {summary.programmes != null && (
          <StatisticCard
            statistic={{ title: "节目", value: summary.programmes, description: "" }}
          />
        )}
        {summary.epgMappings != null && (
          <StatisticCard
            statistic={{ title: "EPG 映射", value: summary.epgMappings, description: "" }}
          />
        )}
        {summary.canonicalMemberships != null && (
          <StatisticCard
            statistic={{ title: "频道归并", value: summary.canonicalMemberships, description: "" }}
          />
        )}
        {summary.streams != null && (
          <StatisticCard
            statistic={{ title: "线路", value: summary.streams, description: "" }}
          />
        )}
        {summary.schedules != null && (
          <StatisticCard
            statistic={{ title: "调度", value: summary.schedules, description: "" }}
          />
        )}
      </StatisticCard.Group>

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
          description={
            w.deletionRatio != null
              ? `${w.message}（删除比例 ${(w.deletionRatio * 100).toFixed(0)}%）`
              : w.message
          }
        />
      ))}

      {/* 009-m3u-control-plane: explicit anomaly banner. FR-016 requires the
          operator to confirm before applying when the snapshot is empty or the
          deletion ratio crosses 25%. */}
      {hasAnomaly && (
        <Alert
          type="error"
          showIcon
          title="异常同步：需要确认后才能应用"
          description={
            <Space orientation="vertical" size={4}>
              <Text>
                本次快照触发了异常保护（FR-016）。确认前最终目录保持上一次可用状态。
              </Text>
              {anomalyWarnings.map((w) => (
                <Text key={w.code} type="secondary">
                  · {w.code === "empty-snapshot"
                    ? "上游返回空目录"
                    : `删除比例 ${(w.deletionRatio * 100).toFixed(0)}% ≥ 25%`}
                  ：{w.message}
                </Text>
              ))}
              <Text type="secondary">
                点击「应用变更」即视为已确认上述警告，操作将记入审计。
              </Text>
            </Space>
          }
        />
      )}

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
          {hasAnomaly ? "确认并应用变更" : "应用变更"}
        </Button>
        {hasBlockers && <Tag color="error">存在阻断项，无法应用</Tag>}
        {hasAnomaly && !hasBlockers && (
          <Tag color="warning">需确认异常警告</Tag>
        )}
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
