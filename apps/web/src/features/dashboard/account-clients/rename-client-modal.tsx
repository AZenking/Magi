import { useEffect } from "react";
import { Button, Form, Input, Modal } from "antd";
import type { DeviceClient } from "@magi/types";
import { useFeedback } from "@/lib/feedback";
import { useRenameDeviceClient } from "./client-queries";

type Props = {
  client: DeviceClient | null;
  open: boolean;
  onClose: () => void;
};

export function RenameClientModal({ client, open, onClose }: Props) {
  const [form] = Form.useForm<{ displayName: string }>();
  const mutation = useRenameDeviceClient();
  const { message } = useFeedback();

  useEffect(() => {
    if (open && client)
      form.setFieldsValue({ displayName: client.displayName });
    if (!open) form.resetFields();
  }, [client, form, open]);

  async function submit(values: { displayName: string }) {
    if (!client) return;
    try {
      await mutation.mutateAsync({
        id: client.id,
        displayName: values.displayName.trim(),
      });
      message.success("客户端名称已更新");
      onClose();
    } catch {
      message.error("重命名失败，请检查名称后重试");
    }
  }

  return (
    <Modal
      title="重命名客户端"
      open={open}
      onCancel={onClose}
      onOk={() => void form.submit()}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      mask={{ closable: false }}
      focusable={{ focusTriggerAfterClose: true }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void submit(values)}
      >
        <Form.Item
          label="客户端名称"
          name="displayName"
          rules={[
            { required: true, whitespace: true, message: "请输入客户端名称" },
            { max: 64, message: "名称不能超过 64 个字符" },
            {
              pattern: /^[^\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]*$/,
              message: "名称不能包含不可显示字符",
            },
          ]}
          normalize={(value: string) => value.trimStart()}
        >
          <Input
            autoFocus
            maxLength={64}
            showCount
            placeholder="例如：客厅电视"
          />
        </Form.Item>
      </Form>
      <Button
        type="link"
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden
      />
    </Modal>
  );
}
