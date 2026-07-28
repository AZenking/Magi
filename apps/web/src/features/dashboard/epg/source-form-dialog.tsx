import { useQuery } from "@tanstack/react-query";
import { Alert, Form, Select, Typography, theme } from "antd";
import {
  ModalForm,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
} from "@ant-design/pro-components";
import { ProDescriptions } from "@ant-design/pro-components";
import type { SourceEffectivePolicy, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import { CardSkeleton } from "@/components/page-skeleton";

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
    return <CardSkeleton rows={2} />;
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
      <ProDescriptions
        size="small"
        column={2}
        dataSource={policy}
        columns={[
          {
            dataIndex: "enabled",
            title: "启用",
            render: (_, entity) => (entity.enabled ? "是" : "否"),
          },
          {
            dataIndex: "participatesInOutput",
            title: "参与输出",
            render: (_, entity) => (entity.participatesInOutput ? "是" : "否"),
          },
          { dataIndex: "role", title: "角色" },
          { dataIndex: "priority", title: "优先级" },
          {
            dataIndex: "fallbackAllowed",
            title: "允许备选",
            render: (_, entity) => (entity.fallbackAllowed ? "是" : "否"),
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
  const isEdit = !!source;

  return (
    <ModalForm
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑源" : "添加源"}
      modalProps={{ destroyOnHidden: true }}
      width={480}
      initialValues={{
        name: source?.name ?? "",
        url: source?.url ?? "",
        enabled: source?.enabled ?? true,
        priority: source?.priority ?? 100,
        participateInOutput: source?.participateInOutput ?? true,
        allowFallback: source?.allowFallback ?? true,
      }}
      onFinish={async (values) => {
        try {
          await onSubmit({
            name: values.name,
            url: values.url,
            enabled: values.enabled,
            ...(sourceType === "m3u"
              ? {
                  priority: values.priority,
                  allowFallback: values.allowFallback,
                  participateInOutput: values.participateInOutput,
                }
              : {}),
          });
          return true;
        } catch (err) {
          message.error(
            `${isEdit ? "源更新失败" : "源添加失败"}：${err instanceof Error ? err.message : "请稍后重试"}`,
          );
          return false;
        }
      }}
    >
      <ProFormText
        name="name"
        label="名称"
        placeholder="源名称…"
        fieldProps={{ autoComplete: "off" }}
        rules={[{ required: true, message: "请输入名称" }]}
      />

      <Form.Item label="类型">
        <Select
          disabled
          value={sourceType}
          options={[
            { value: "m3u", label: "M3U" },
            { value: "xmltv", label: "XMLTV" },
          ]}
        />
      </Form.Item>

      <ProFormText
        name="url"
        label="URL"
        placeholder="https://example.com/source"
        fieldProps={{ autoComplete: "url" }}
        rules={[
          { required: true, message: "请输入 URL" },
          {
            pattern: /^https?:\/\//,
            message: "必须以 http:// 或 https:// 开头",
          },
        ]}
      />

      <ProFormSelect<boolean>
        name="enabled"
        label="状态"
        options={[
          { value: true, label: "启用" },
          { value: false, label: "禁用" },
        ]}
      />

      {sourceType === "m3u" && (
        <>
          <ProFormDigit
            name="priority"
            label="优先级"
            placeholder="100"
            min={0}
            max={9999}
            fieldProps={{ precision: 0 }}
          />
          <ProFormSelect<boolean>
            name="participateInOutput"
            label="参与输出"
            options={[
              { value: true, label: "是" },
              { value: false, label: "否" },
            ]}
          />
          <ProFormSelect<boolean>
            name="allowFallback"
            label="允许作为备选源"
            options={[
              { value: true, label: "是" },
              { value: false, label: "否" },
            ]}
          />
        </>
      )}

      {source && sourceType === "m3u" && <EffectivePolicyPreview source={source} />}
    </ModalForm>
  );
}
