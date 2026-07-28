import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Typography,
  theme,
} from "antd";
import type { SourceEffectivePolicy, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";

const sourceFormSchema = z.object({
  name: z.string().min(1, "请输入名称").max(255),
  url: z
    .string()
    .refine(
      (u) => {
        if (!u) return false;
        try {
          new URL(u);
        } catch {
          return false;
        }
        return u.startsWith("http://") || u.startsWith("https://");
      },
      { message: "请输入有效的 URL（以 http:// 或 https:// 开头）" },
    ),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(9999).default(100),
  allowFallback: z.boolean().default(true),
  participateInOutput: z.boolean().default(true),
});

function getErrorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * T124: read-only effective-policy preview shown inside the edit dialog. Reads
 * `GET /sources/{type}/{id}/effective-policy` and surfaces the resolved role,
 * priority, participation/fallback flags and the server-provided Chinese
 * summary. The summary explains how enabled/output/fallback interact
 * (contracts/common.md). For XMLTV we skip the block entirely.
 */
function EffectivePolicyPreview({
  source,
}: {
  source: Pick<SourceVo, "id" | "type">;
}) {
  const { token } = theme.useToken();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["source-effective-policy", source.type, source.id],
    queryFn: () =>
      apiClient<{ success: boolean; data: SourceEffectivePolicy }>(
        `/sources/${source.type}/${source.id}/effective-policy`,
      ),
  });

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 2 }} />;
  }
  if (isError) {
    return (
      <Alert
        type="info"
        showIcon
        title="生效策略暂不可用"
        description="保存后将重新计算生效策略。"
      />
    );
  }

  const policy = data?.data;
  if (!policy) return null;

  return (
    <div
      style={{
        marginTop: token.marginMD,
        paddingTop: token.paddingMD,
        borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
      }}
    >
      <Typography.Text strong>生效策略预览</Typography.Text>
      <Typography.Paragraph
        type="secondary"
        style={{ marginTop: token.marginXS, marginBottom: token.marginSM }}
      >
        {policy.summary}
      </Typography.Paragraph>
      <Descriptions
        size="small"
        column={2}
        items={[
          { key: "enabled", label: "启用", children: policy.enabled ? "是" : "否" },
          {
            key: "participates",
            label: "参与输出",
            children: policy.participatesInOutput ? "是" : "否",
          },
          { key: "role", label: "角色", children: policy.role },
          { key: "priority", label: "优先级", children: policy.priority },
          {
            key: "fallback",
            label: "允许备选",
            children: policy.fallbackAllowed ? "是" : "否",
          },
        ]}
      />
    </div>
  );
}

interface SourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: SourceVo | null;
  sourceType: "m3u" | "xmltv";
  onSubmit: (data: {
    name: string;
    url: string;
    enabled: boolean;
    priority?: number;
    allowFallback?: boolean;
    participateInOutput?: boolean;
  }) => Promise<void>;
}

export function SourceFormDialog({
  open,
  onOpenChange,
  source,
  sourceType,
  onSubmit,
}: SourceFormDialogProps) {
  const { message } = useFeedback();
  const [pending, setPending] = useState(false);
  const isEdit = !!source;

  const form = useForm({
    defaultValues: {
      name: source?.name ?? "",
      url: source?.url ?? "",
      enabled: source?.enabled ?? true,
      priority: source?.priority ?? 100,
      allowFallback: source?.allowFallback ?? true,
      participateInOutput: source?.participateInOutput ?? true,
    },
    validators: {
      onChange: sourceFormSchema as never,
    },
    onSubmit: async ({ value }) => {
      setPending(true);
      try {
        await onSubmit({
          name: value.name,
          url: value.url,
          enabled: value.enabled,
          ...(sourceType === "m3u"
            ? {
                priority: value.priority,
                allowFallback: value.allowFallback,
                participateInOutput: value.participateInOutput,
              }
            : {}),
        });
        onOpenChange(false);
      } catch (err) {
        message.error(`${isEdit ? "源更新失败" : "源添加失败"}：${err instanceof Error ? err.message : "请稍后重试"}`);
      } finally {
        setPending(false);
      }
    },
  });

  return (
    <Modal
      open={open}
      title={isEdit ? "编辑源" : "添加源"}
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
        <form.Field name="name">
          {(field) => {
            const error =
              field.state.meta.isTouched && !field.state.meta.isValid
                ? getErrorMessage(field.state.meta.errors[0])
                : undefined;
            return (
              <Form.Item label="名称" validateStatus={error ? "error" : ""} help={error}>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="源名称…"
                  autoComplete="off"
                />
              </Form.Item>
            );
          }}
        </form.Field>

        <Form.Item label="类型">
          <Select value={sourceType} disabled options={[
            { value: "m3u", label: "M3U" },
            { value: "xmltv", label: "XMLTV" },
          ]} />
        </Form.Item>

        <form.Field name="url">
          {(field) => {
            const error =
              field.state.meta.isTouched && !field.state.meta.isValid
                ? getErrorMessage(field.state.meta.errors[0])
                : undefined;
            return (
              <Form.Item label="URL" validateStatus={error ? "error" : ""} help={error}>
                <Input
                  type="url"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="https://example.com/source"
                  autoComplete="url"
                />
              </Form.Item>
            );
          }}
        </form.Field>

        <form.Field name="enabled">
          {(field) => (
            <Form.Item label="状态">
              <Select
                value={field.state.value ? "true" : "false"}
                onChange={(v) => field.handleChange(v === "true")}
                options={[
                  { value: "true", label: "启用" },
                  { value: "false", label: "禁用" },
                ]}
              />
            </Form.Item>
          )}
        </form.Field>

        {sourceType === "m3u" && (
          <>
            <form.Field name="priority">
              {(field) => {
                const error =
                  field.state.meta.isTouched && !field.state.meta.isValid
                    ? getErrorMessage(field.state.meta.errors[0])
                    : undefined;
                return (
                  <Form.Item
                    label="优先级"
                    validateStatus={error ? "error" : ""}
                    help={error}
                  >
                    <Input
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      onBlur={field.handleBlur}
                      placeholder="100"
                      min={0}
                      max={9999}
                    />
                  </Form.Item>
                );
              }}
            </form.Field>

            <form.Field name="participateInOutput">
              {(field) => (
                <Form.Item label="参与输出">
                  <Select
                    value={field.state.value ? "true" : "false"}
                    onChange={(v) => field.handleChange(v === "true")}
                    options={[
                      { value: "true", label: "是" },
                      { value: "false", label: "否" },
                    ]}
                  />
                </Form.Item>
              )}
            </form.Field>

            <form.Field name="allowFallback">
              {(field) => (
                <Form.Item label="允许作为备选源">
                  <Select
                    value={field.state.value ? "true" : "false"}
                    onChange={(v) => field.handleChange(v === "true")}
                    options={[
                      { value: "true", label: "是" },
                      { value: "false", label: "否" },
                    ]}
                  />
                </Form.Item>
              )}
            </form.Field>
          </>
        )}

        {source && sourceType === "m3u" && (
          <EffectivePolicyPreview source={source} />
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
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
