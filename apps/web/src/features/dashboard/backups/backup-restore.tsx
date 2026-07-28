/**
 * BackupRestore (T106).
 *
 * Preflight panel + apply button for restoring a backup. Reads
 * GET /backups/:id/restore-preflight to show add/overwrite/skip/conflict/
 * unsupported counts and the blocker code. Apply triggers a backup_restore
 * operation preview (POST /operations/previews kind=backup_restore), then
 * reuses OperationPreview for the standard confirm→apply flow.
 *
 * antd v6 visual language (T001): token-only colors, single primary action.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Modal, Skeleton, Space, Statistic, Tag, Typography, theme } from "antd";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import { OperationPreview } from "@/features/dashboard/operations/operation-preview";
import { usePreparePreview } from "@/features/dashboard/operations/operation-queries";

const { Text } = Typography;

interface RestorePreflight {
  backupId: string;
  canRestore: boolean;
  blockerCode: string | null;
  summary: {
    add: number;
    overwrite: number;
    skip: number;
    conflict: number;
    unsupported: number;
  };
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export function BackupRestore({
  backupId,
  open,
  onClose,
}: {
  backupId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { token } = theme.useToken();
  const { message } = useFeedback();
  const qc = useQueryClient();
  const preparePreview = usePreparePreview();
  const [changeSetId, setChangeSetId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["backup", "restore-preflight", backupId],
    queryFn: async () => {
      const res = await apiClient<Envelope<RestorePreflight>>(
        `/backups/${backupId}/restore-preflight`,
      );
      return res.data;
    },
    enabled: !!backupId && open,
  });

  const handleApply = async () => {
    try {
      // Build a backup_restore preview; OperationPreview drives apply.
      // scope uses the global scope type for whole-config restore
      // (contracts/operation-previews.md).
      const result = await preparePreview.mutateAsync({
        kind: "backup_restore",
        scope: { type: "global", id: backupId },
        parameters: { backupId },
        expectedVersions: {},
      });
      setChangeSetId(result.changeSet.id);
    } catch (err) {
      message.error(
        `准备恢复失败：${err instanceof Error ? err.message : "请稍后重试"}`,
      );
    }
  };

  const handleClose = () => {
    setChangeSetId(null);
    qc.invalidateQueries({ queryKey: ["backups"] });
    onClose();
  };

  return (
    <Modal
      open={open}
      title="恢复备份"
      onCancel={handleClose}
      width={720}
      footer={null}
      destroyOnHidden
      mask={{ closable: false }}
    >
      {changeSetId ? (
        <OperationPreview
          changeSetId={changeSetId}
          onClose={handleClose}
          onApplied={() => {
            message.success("恢复任务已提交，请关注任务进度");
          }}
        />
      ) : (
        <Space orientation="vertical" size={token.marginMD} style={{ width: "100%" }}>
          <Text type="secondary">
            预检查不会修改当前运营状态。应用前会自动创建恢复点，验证失败时不会留下任何变更。
          </Text>

          {isLoading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : error ? (
            <Alert
              type="error"
              showIcon
              title="预检查加载失败"
              description={error.message}
            />
          ) : data ? (
            <>
              {!data.canRestore && data.blockerCode && (
                <Alert
                  type="error"
                  showIcon
                  title="阻断：无法恢复"
                  description={blockerLabel(data.blockerCode)}
                />
              )}

              <Space size={token.marginLG} wrap>
                <Statistic title="新增" value={data.summary.add} />
                <Statistic title="覆盖" value={data.summary.overwrite} />
                <Statistic title="跳过" value={data.summary.skip} />
                <Statistic
                  title="冲突"
                  value={data.summary.conflict}
                  styles={{
                    content:
                      data.summary.conflict > 0
                        ? { color: token.colorError }
                        : undefined,
                  }}
                />
                <Statistic
                  title="不兼容"
                  value={data.summary.unsupported}
                  styles={{
                    content:
                      data.summary.unsupported > 0
                        ? { color: token.colorWarning }
                        : undefined,
                  }}
                />
              </Space>

              <Space>
                <Button onClick={handleClose}>取消</Button>
                <Button
                  type="primary"
                  loading={preparePreview.isPending}
                  disabled={!data.canRestore}
                  onClick={handleApply}
                >
                  继续恢复
                </Button>
                {!data.canRestore && <Tag color="error">存在阻断项</Tag>}
              </Space>
            </>
          ) : null}
        </Space>
      )}
    </Modal>
  );
}

/** Map server blocker codes to readable Chinese copy. */
function blockerLabel(code: string): string {
  switch (code) {
    case "resource-not-found":
      return "备份不存在或已被清理。";
    case "backup-not-ready":
      return "备份尚未就绪，请等待生成完成或选择其他备份。";
    case "backup-object-missing":
      return "备份文件已丢失，无法读取。";
    case "unsupported-format-version":
      return "备份格式版本不被支持，可能由更高版本生成。";
    default:
      return code;
  }
}

