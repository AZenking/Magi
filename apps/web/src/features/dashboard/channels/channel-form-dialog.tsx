import {
  ModalForm,
  ProFormDigit,
  ProFormSwitch,
  ProFormText,
} from "@ant-design/pro-components";
import type { CanonicalChannelVo } from "@magi/types";
import { useFeedback } from "@/lib/feedback";

interface ChannelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: CanonicalChannelVo;
  onSubmit: (data: {
    standardName?: string | null;
    standardGroup?: string | null;
    standardLogo?: string | null;
    channelNumber?: number | null;
    epgChannelId?: string | null;
    hidden?: boolean;
    starred?: boolean;
  }) => Promise<void>;
}

export function OutputChannelFormDialog({
  open,
  onOpenChange,
  channel,
  onSubmit,
}: ChannelFormDialogProps) {
  const { message } = useFeedback();

  return (
    <ModalForm
      open={open}
      onOpenChange={onOpenChange}
      title="编辑频道"
      modalProps={{ destroyOnHidden: true }}
      initialValues={{
        standardName: channel.standardName ?? "",
        standardGroup: channel.standardGroup ?? "",
        standardLogo: channel.standardLogo ?? "",
        channelNumber: channel.channelNumber as number | undefined,
        epgChannelId: channel.epgChannelId ?? "",
        hidden: channel.hidden,
        starred: channel.starred,
      }}
      onFinish={async (values) => {
        try {
          await onSubmit({
            standardName: values.standardName || null,
            standardGroup: values.standardGroup || null,
            standardLogo: values.standardLogo || null,
            channelNumber: values.channelNumber ?? null,
            epgChannelId: values.epgChannelId || null,
            hidden: values.hidden,
            starred: values.starred,
          });
          message.success("频道已更新");
          return true;
        } catch (err) {
          message.error(`更新失败：${err instanceof Error ? err.message : "请稍后重试"}`);
          return false;
        }
      }}
    >
      <ProFormText
        name="standardName"
        label="频道名称"
        placeholder="频道名称"
        fieldProps={{ autoComplete: "off" }}
        rules={[{ required: true, message: "请输入频道名称" }]}
      />

      <ProFormText
        name="standardGroup"
        label="分组"
        placeholder="分组名称"
        fieldProps={{ autoComplete: "off" }}
      />

      <ProFormText
        name="standardLogo"
        label="Logo URL"
        placeholder="https://..."
        fieldProps={{ autoComplete: "url" }}
      />

      <ProFormText
        name="epgChannelId"
        label="EPG Channel ID / tvg-id"
        placeholder="CCTV1"
        fieldProps={{ autoComplete: "off" }}
      />

      <ProFormDigit
        name="channelNumber"
        label="频道号"
        placeholder="自动"
        min={0}
        fieldProps={{ precision: 0 }}
      />

      <ProFormSwitch name="hidden" label="隐藏" />

      <ProFormSwitch name="starred" label="收藏" />
    </ModalForm>
  );
}
