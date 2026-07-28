/**
 * EpgMatchBatchActions (T071).
 *
 * Batch decision toolbar for the EPG workbench: accept all safe (exact/fuzzy)
 * items at once, leaving conflict/unmatched items for manual resolution.
 * Sends decisions through PATCH /operations/change-sets/:id/items (If-Match).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Flex, Modal, Tag, Typography, theme } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import { useChangeItems, operationKeys } from "@/features/dashboard/operations/operation-queries";

interface DecisionPatch {
  itemId: string;
  selected: boolean;
  candidateId?: string;
  lockManualDecision?: boolean;
}

export function EpgMatchBatchActions({
  changeSetId,
  version,
}: {
  changeSetId: string;
  version: number;
}) {
  const { token } = theme.useToken();
  const { message } = useFeedback();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Read page 1 of all classifications to compute the safe-accept set.
  const { data } = useChangeItems(changeSetId, 1);
  const items = (data?.items ?? []) as Array<{
    itemId: string;
    classification?: string;
    selected: boolean;
  }>;
  const safeItems = items.filter(
    (i) => (i.classification === "exact" || i.classification === "fuzzy") && !i.selected,
  );

  const batchMutation = useMutation({
    mutationFn: async (decisions: DecisionPatch[]) => {
      return apiClient(
        `/operations/change-sets/${changeSetId}/items`,
        {
          method: "PATCH",
          headers: { "If-Match": `"${version}"` },
          body: { decisions },
        },
      );
    },
    onSuccess: () => {
      message.success(`已批量接受 ${safeItems.length} 个安全匹配项`);
      qc.invalidateQueries({ queryKey: operationKeys.changeSet(changeSetId) });
      qc.invalidateQueries({ queryKey: operationKeys.changeItems(changeSetId, 1) });
    },
    onError: (err) => message.error(`批量操作失败：${err.message}`),
  });

  const handleAccept = () => {
    const decisions: DecisionPatch[] = safeItems.map((i) => ({
      itemId: i.itemId,
      selected: true,
    }));
    batchMutation.mutate(decisions);
    setConfirmOpen(false);
  };

  return (
    <>
      <Flex align="center" gap={token.marginSM}>
        <Button
          icon={<CheckOutlined />}
          disabled={safeItems.length === 0}
          loading={batchMutation.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          批量接受安全项 ({safeItems.length})
        </Button>
        <Typography.Text type="secondary">
          仅精确/模糊匹配项；冲突与未匹配项需单独处理。
        </Typography.Text>
      </Flex>

      <Modal
        open={confirmOpen}
        title="确认批量接受"
        okText={`接受 ${safeItems.length} 项`}
        cancelText="取消"
        okButtonProps={{ loading: batchMutation.isPending }}
        onCancel={() => setConfirmOpen(false)}
        onOk={handleAccept}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Flex vertical gap={token.marginXS}>
          <Typography.Text>
            将选中 {safeItems.length} 个精确/模糊匹配项。
          </Typography.Text>
          <Tag>已锁定的人工绑定不会被自动匹配覆盖。</Tag>
        </Flex>
      </Modal>
    </>
  );
}
