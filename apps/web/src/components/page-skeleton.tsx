/**
 * Unified loading placeholders — replaces scattered <Spin description>,
 * <Card loading> and <Skeleton> usages with a consistent visual language.
 *
 * Three presets matching the three loading contexts in the app:
 * - PageSkeleton: full-page/route loading (replaces <Spin description="..." />)
 * - CardSkeleton: card/section loading (replaces <Card loading> / <Skeleton>)
 * - InlineSkeleton: small inline loading (replaces <Spin size="small" />)
 */
import { Card, Skeleton, Spin, theme } from "antd";

/** Full-page loading with centered Spin + description. */
export function PageSkeleton({ description = "加载中…" }: { description?: string }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: 300,
        padding: token.paddingXL,
      }}
    >
      <Spin size="large" description={description} />
    </div>
  );
}

/** Card / section loading with skeleton lines. */
export function CardSkeleton({
  rows = 3,
  active = true,
}: {
  rows?: number;
  active?: boolean;
}) {
  return (
    <Card>
      <Skeleton active={active} paragraph={{ rows }} />
    </Card>
  );
}

/** Small inline loading spinner (no text). */
export function InlineSkeleton() {
  return <Spin size="small" />;
}
