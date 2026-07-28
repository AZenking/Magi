/**
 * EpgMatchSummary (T071).
 *
 * Four-class classification counts for an EPG match change set: exact, fuzzy,
 * conflict, unmatched. Surfaces which locked manual bindings are preserved.
 * antd v6 visual language: token-driven semantic colors, 4px grid.
 */
import { Space, Statistic, Tag, theme } from "antd";

interface EpgMatchSummaryData {
  exact?: number;
  fuzzy?: number;
  conflict?: number;
  unmatched?: number;
  preserved?: number;
}

const CLASS_ITEMS: Array<{
  key: keyof EpgMatchSummaryData;
  label: string;
  color?: string;
}> = [
  { key: "exact", label: "精确匹配", color: "success" },
  { key: "fuzzy", label: "模糊匹配", color: "warning" },
  { key: "conflict", label: "冲突", color: "error" },
  { key: "unmatched", label: "未匹配" },
];

export function EpgMatchSummary({
  summary,
}: {
  summary: EpgMatchSummaryData | Record<string, number> | undefined;
}) {
  const { token } = theme.useToken();
  const data: EpgMatchSummaryData = (summary ?? {}) as EpgMatchSummaryData;

  return (
    <Space size={24} wrap align="end">
      {CLASS_ITEMS.map((item) => (
        <Statistic
          key={item.key}
          title={item.label}
          value={data[item.key] ?? 0}
          styles={{ content: item.color === "error" && (data[item.key] ?? 0) > 0 ? { color: token.colorError } : undefined }}
        />
      ))}
      {data.preserved != null && (
        <Statistic title="保留人工绑定" value={data.preserved} />
      )}
      {(data.conflict ?? 0) > 0 && (
        <Tag color="error">存在冲突项，需人工处理后才能应用</Tag>
      )}
    </Space>
  );
}
