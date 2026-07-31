import { Button, Modal, Typography } from "antd";
import type { DeviceClient } from "@magi/types";
import { useFeedback } from "@/lib/feedback";
import { useRevokeDeviceClient } from "./client-queries";

type Props = {
  client: DeviceClient | null;
  open: boolean;
  onClose: () => void;
};

export function RevokeClientModal({ client, open, onClose }: Props) {
  const mutation = useRevokeDeviceClient();
  const { message } = useFeedback();

  async function revoke() {
    if (!client) return;
    try {
      await mutation.mutateAsync(client.id);
      message.success("客户端访问已撤销");
      onClose();
    } catch {
      message.error("撤销失败，请保留窗口并重试");
    }
  }

  return (
    <Modal
      title="撤销客户端访问"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      mask={{ closable: false }}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={mutation.isPending}>
          取消
        </Button>,
        <Button
          key="revoke"
          danger
          type="primary"
          loading={mutation.isPending}
          onClick={() => void revoke()}
        >
          撤销访问
        </Button>,
      ]}
    >
      <Typography.Paragraph>
        确定要撤销「{client?.displayName}
        」吗？撤销后该设备立即失去访问权限并停止心跳。原客户端无法恢复；再次使用需要重新授权为新客户端。
      </Typography.Paragraph>
    </Modal>
  );
}
