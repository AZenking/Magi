import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Modal,
  Result,
  Select,
  Space,
  Tag,
  Typography,
  theme,
} from "antd";
import { ProList } from "@ant-design/pro-components";
import {
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Link } from "@tanstack/react-router";
import type { SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import { PageHeader, PageStack } from "@/components/page-layout";
import { OperationPreview } from "@/features/dashboard/operations/operation-preview";
import { usePreparePreview, useChangeSet } from "@/features/dashboard/operations/operation-queries";
import { EpgMatchSummary } from "@/features/dashboard/epg/epg-match-summary";
import { EpgMatchCandidates } from "@/features/dashboard/epg/epg-match-candidates";
import { EpgMatchBatchActions } from "@/features/dashboard/epg/epg-match-batch-actions";
import { InlineSkeleton } from "@/components/page-skeleton";

export const Route = createFileRoute("/dashboard/epg-matching")({
  component: EpgMatchingPage,
});

/** T074: human-readable blocker hints with the matching repair action. */
function blockerHint(code: string): string {
  switch (code) {
    case "xmltv-source-not-found":
      return "来源不存在，请添加 XMLTV 来源。";
    case "xmltv-source-disabled":
      return "来源已禁用，请启用后再匹配。";
    case "xmltv-not-synced":
      return "来源从未同步或上次同步失败，请先执行同步。";
    case "xmltv-data-stale":
      return "数据已过期，请重新同步。";
    default:
      return code;
  }
}

/**
 * EpgMatchWorkbench (T072) — composes the EPG-specific summary, batch actions
 * and candidate detail on top of the generic OperationPreview so the operator
 * can classify, resolve conflicts and apply in one surface.
 */
function EpgMatchWorkbench({
  changeSetId,
  onClose,
  onApplied,
}: {
  changeSetId: string;
  onClose: () => void;
  onApplied: (taskId: string) => void;
}) {
  const { token } = theme.useToken();
  const { data } = useChangeSet(changeSetId);
  const version = data?.version ?? 1;

  return (
    <Flex vertical gap={token.marginMD}>
      <EpgMatchSummary summary={data?.summary as Record<string, number> | undefined} />
      {data?.status === "ready" && (
        <EpgMatchBatchActions changeSetId={changeSetId} version={version} />
      )}
      <EpgMatchCandidates changeSetId={changeSetId} />
      <OperationPreview changeSetId={changeSetId} onClose={onClose} onApplied={onApplied} />
    </Flex>
  );
}

function EpgMatchingPage() {
  const { message, notification } = useFeedback();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const [selectedSourceId, setSelectedSourceId] = useState("");

  const {
    data: sourcesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["xmltv-sources"],
    queryFn: () =>
      apiClient<{ success: boolean; data: { items: SourceVo[] } }>("/sources", {
        params: { type: "xmltv", pageSize: 100 },
      }),
  });

  const xmltvSources = sourcesData?.data?.items ?? [];

  // T070/T074: XMLTV readiness for the selected source — surfacing blockers
  // (disabled/never-synced/failed/stale) with direct repair links before the
  // operator triggers a match (contracts/common.md SourceReadiness).
  const {
    data: readinessData,
    isLoading: readinessLoading,
  } = useQuery({
    queryKey: ["xmltv-readiness", selectedSourceId],
    queryFn: () =>
      apiClient<{ success: boolean; data: { canSync: boolean; canMatch: boolean; blockerCodes: string[] } }>(
        `/epg/sources/${selectedSourceId}/readiness`,
      ),
    enabled: !!selectedSourceId,
  });
  const readiness = readinessData?.data;

  // Safe Operations (T047): EPG match goes preview → confirm → task (FR-001).
  const [previewChangeSetId, setPreviewChangeSetId] = useState<string | null>(null);
  const preparePreview = usePreparePreview();

  const handleMatch = useCallback(
    (sourceId: string) => {
      if (!sourceId) {
        message.error("请先选择一个 XMLTV 源");
        return;
      }
      preparePreview.mutate(
        {
          kind: "epg_match",
          scope: { type: "source", id: sourceId },
          parameters: { sourceId },
          expectedVersions: {},
        },
        {
          onSuccess: (result) => {
            setPreviewChangeSetId(result.changeSet.id);
          },
          onError: (mutationError) => {
            message.error(
              `创建匹配预览失败：${mutationError instanceof Error ? mutationError.message : "请稍后重试"}`,
            );
          },
        },
      );
    },
    [message, preparePreview],
  );

  return (
    <PageStack>
      <PageHeader title="EPG 匹配" />

      <Card title="执行 EPG 匹配">
        <Typography.Paragraph type="secondary">
          选择一个 XMLTV 源，将其频道数据与已有频道进行自动匹配。系统会根据
          tvg-id、频道名称等多维度进行匹配。
        </Typography.Paragraph>
        <Flex align="flex-end" wrap gap={token.marginMD}>
          <div style={{ flex: 1, maxWidth: 400 }}>
            <Typography.Text strong>XMLTV 源</Typography.Text>
            <Select
              value={selectedSourceId || undefined}
              onChange={setSelectedSourceId}
              loading={isLoading}
              placeholder={isLoading ? "加载中…" : "选择 XMLTV 源"}
              options={xmltvSources.map((source) => ({
                value: source.id,
                label: source.name,
              }))}
              aria-label="选择 XMLTV 源"
              style={{ width: "100%", marginTop: token.marginXS }}
            />
          </div>
          <Button
            type="primary"
            onClick={() => handleMatch(selectedSourceId)}
            disabled={!selectedSourceId || !readiness?.canMatch}
            loading={preparePreview.isPending}
            icon={<ThunderboltOutlined />}
          >
            预览匹配
          </Button>
        </Flex>

        {/* T070/T074: readiness blockers + direct repair links. */}
        {selectedSourceId && readinessLoading && <InlineSkeleton />}
        {selectedSourceId && readiness && !readiness.canMatch && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: token.marginMD }}
            title="该来源尚不可用于匹配"
            description={
              <Space orientation="vertical" size={token.marginXS}>
                {readiness.blockerCodes.map((code) => (
                  <Typography.Text key={code}>
                    {blockerHint(code)}
                  </Typography.Text>
                ))}
                <Link to="/dashboard/sources/xmltv">
                  <Typography.Link>
                    前往 EPG 源管理修复 <LinkOutlined />
                  </Typography.Link>
                </Link>
              </Space>
            }
          />
        )}
      </Card>

      <ProList<SourceVo>
        rowKey="id"
        headerTitle="XMLTV 源列表"
        toolBarRender={() => [
          <Link key="add" to="/dashboard/sources/xmltv">
            <Button type="primary" icon={<PlusOutlined />}>
              添加 XMLTV 源
            </Button>
          </Link>,
          <Button
            key="refresh"
            icon={<ReloadOutlined />}
            onClick={() => void refetch()}
          >
            刷新
          </Button>,
        ]}
        dataSource={xmltvSources}
        loading={isLoading}
        split
        locale={{
          emptyText: error ? (
            <Result
              status="error"
              title="XMLTV 源加载失败"
              subTitle={error.message}
              extra={<Button onClick={() => void refetch()}>重试</Button>}
            />
          ) : (
            <Empty description="暂无 XMLTV 源">
              <Link to="/dashboard/sources/xmltv">
                <Button type="primary" icon={<PlusOutlined />}>
                  添加 XMLTV 源
                </Button>
              </Link>
            </Empty>
          ),
        }}
        metas={{
          title: {
            render: (_, source) => (
              <Flex vertical style={{ minWidth: 0 }}>
                <Typography.Text strong>{source.name}</Typography.Text>
                <Typography.Paragraph
                  type="secondary"
                  ellipsis
                  style={{ margin: 0, maxWidth: 400 }}
                >
                  {source.url}
                </Typography.Paragraph>
              </Flex>
            ),
          },
          description: {
            render: (_, source) => (
              <Flex align="center" wrap gap={token.marginXS}>
                <Tag color={source.enabled ? "blue" : undefined}>
                  {source.enabled ? "启用" : "禁用"}
                </Tag>
                {source.lastSyncStatus && (
                  <Tag
                    color={
                      source.lastSyncStatus === "success" ? "green" : "red"
                    }
                  >
                    {source.lastSyncStatus === "success"
                      ? "已同步"
                      : "同步失败"}
                  </Tag>
                )}
                {source.lastSyncAt && (
                  <Typography.Text type="secondary">
                    {new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(source.lastSyncAt))}
                  </Typography.Text>
                )}
              </Flex>
            ),
          },
          actions: {
            render: (_, source) => [
              <Button
                key="match"
                size="small"
                onClick={() => {
                  setSelectedSourceId(source.id);
                  handleMatch(source.id);
                }}
                loading={
                  preparePreview.isPending && selectedSourceId === source.id
                }
              >
                预览匹配
              </Button>,
            ],
          },
        }}
      />

      <Modal
        open={!!previewChangeSetId}
        title="EPG 匹配工作台"
        onCancel={() => setPreviewChangeSetId(null)}
        footer={null}
        width={960}
        mask={{ closable: false }}
        destroyOnHidden
      >
        {previewChangeSetId && (
          <EpgMatchWorkbench
            changeSetId={previewChangeSetId}
            onClose={() => {
              setPreviewChangeSetId(null);
              void queryClient.invalidateQueries({ queryKey: ["xmltv-sources"] });
            }}
            onApplied={(taskId) => {
              notification.success({
                title: "EPG 匹配已提交应用",
                description: "应用任务执行中，完成后结果自动刷新",
                actions: (
                  <Button
                    type="link"
                    size="small"
                    onClick={() =>
                      navigate({ to: "/dashboard/tasks/$taskId", params: { taskId } })
                    }
                  >
                    查看任务
                  </Button>
                ),
              });
            }}
          />
        )}
      </Modal>
    </PageStack>
  );
}
