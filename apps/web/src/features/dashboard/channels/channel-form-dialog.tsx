import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button, Checkbox, Form, Input, Modal } from "antd";
import type { CanonicalChannelVo } from "@magi/types";
import { useFeedback } from "@/lib/feedback";

const channelFormSchema = z.object({
  standardName: z.string().min(1, "请输入频道名称").max(255).nullable(),
  standardGroup: z.string().max(255).nullable(),
  standardLogo: z.string().max(1024).nullable(),
  channelNumber: z.number().int().min(0).nullable(),
  epgChannelId: z.string().max(255).nullable(),
  hidden: z.boolean(),
  starred: z.boolean(),
});

function getErrorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

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
  const [pending, setPending] = useState(false);

  const form = useForm({
    defaultValues: {
      standardName: channel.standardName ?? "",
      standardGroup: channel.standardGroup ?? "",
      standardLogo: channel.standardLogo ?? "",
      channelNumber: channel.channelNumber as number | undefined,
      epgChannelId: channel.epgChannelId ?? "",
      hidden: channel.hidden,
      starred: channel.starred,
    },
    validators: {
      onChangeAsync: channelFormSchema as never,
    },
    onSubmit: async ({ value }) => {
      setPending(true);
      try {
        await onSubmit({
          standardName: value.standardName || null,
          standardGroup: value.standardGroup || null,
          standardLogo: value.standardLogo || null,
          channelNumber: value.channelNumber ?? null,
          epgChannelId: value.epgChannelId || null,
          hidden: value.hidden,
          starred: value.starred,
        });
        message.success("频道已更新");
        onOpenChange(false);
      } catch (err) {
        message.error(`更新失败：${err instanceof Error ? err.message : "请稍后重试"}`);
      } finally {
        setPending(false);
      }
    },
  });

  return (
    <Modal
      open={open}
      title="编辑频道"
      onCancel={() => onOpenChange(false)}
      footer={null}
      destroyOnHidden
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
      <Form
        layout="vertical"
        disabled={pending}
      >
        <form.Field name="standardName">
          {(field) => {
            const error =
              field.state.meta.isTouched && !field.state.meta.isValid
                ? getErrorMessage(field.state.meta.errors[0])
                : undefined;
            return (
              <Form.Item
                label="频道名称"
                validateStatus={error ? "error" : ""}
                help={error}
              >
                <Input
                  value={field.state.value ?? ""}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="频道名称"
                  autoComplete="off"
                />
              </Form.Item>
            );
          }}
        </form.Field>

        <form.Field name="standardGroup">
          {(field) => (
            <Form.Item label="分组">
              <Input
                value={field.state.value ?? ""}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="分组名称"
                autoComplete="off"
              />
            </Form.Item>
          )}
        </form.Field>

        <form.Field name="standardLogo">
          {(field) => (
            <Form.Item label="Logo URL">
              <Input
                value={field.state.value ?? ""}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="https://..."
                autoComplete="url"
              />
            </Form.Item>
          )}
        </form.Field>

        <form.Field name="epgChannelId">
          {(field) => (
            <Form.Item label="EPG Channel ID / tvg-id">
              <Input
                value={field.state.value ?? ""}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="CCTV1"
                autoComplete="off"
              />
            </Form.Item>
          )}
        </form.Field>

        <form.Field name="channelNumber">
          {(field) => (
            <Form.Item label="频道号">
              <Input
                type="number"
                value={field.state.value ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  field.handleChange(
                    v === "" ? (undefined as unknown as number) : parseInt(v, 10),
                  );
                }}
                onBlur={field.handleBlur}
                placeholder="自动"
                autoComplete="off"
              />
            </Form.Item>
          )}
        </form.Field>

        <form.Field name="hidden">
          {(field) => (
            <Form.Item style={{ marginBottom: 8 }}>
              <Checkbox
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              >
                隐藏
              </Checkbox>
            </Form.Item>
          )}
        </form.Field>

        <form.Field name="starred">
          {(field) => (
            <Form.Item style={{ marginBottom: 16 }}>
              <Checkbox
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              >
                收藏
              </Checkbox>
            </Form.Item>
          )}
        </form.Field>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button type="primary" htmlType="submit" loading={pending}>
            保存
          </Button>
        </div>
      </Form>
      </form>
    </Modal>
  );
}
