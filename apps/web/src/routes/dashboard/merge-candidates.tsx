/**
 * Merge candidates route (009-m3u-control-plane T030 wiring).
 *
 * Mounts MergeCandidateReview at /dashboard/merge-candidates. The page is
 * reachable from the sidebar (output management section) and lets operators
 * review weak-signal composition candidates emitted during M3U sync.
 *
 * The component itself owns its pagination + filtering; the route just wraps
 * it with the dashboard shell's loading / error statesman.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Alert, Button, Card, Space, Spin, Typography } from "antd";
import { MergeCandidateReview } from "@/features/dashboard/channels/merge-candidates";
import { PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/merge-candidates")({
  component: MergeCandidatesPage,
  pendingComponent: () => (
    <PageStack>
      <Card size="small">
        <Spin tip="加载合并候选…" />
      </Card>
    </PageStack>
  ),
  errorComponent: (props: { error: Error; reset?: () => void }) => (
    <PageStack>
      <Alert
        type="error"
        showIcon
        title="加载失败"
        description={
          <Space size={8}>
            <Typography.Text>
              {props.error?.message ?? "无法读取合并候选列表。"}
            </Typography.Text>
            {props.reset && (
              <Button type="primary" size="small" onClick={props.reset}>
                重试
              </Button>
            )}
          </Space>
        }
      />
    </PageStack>
  ),
});

function MergeCandidatesPage() {
  return (
    <PageStack>
      <PageHeader
        title="合并候选审核"
        description="仅相同 tvg-id 的来源频道会自动合并;名称/分组相似的需要您手动确认。"
      />
      <MergeCandidateReview />
    </PageStack>
  );
}
