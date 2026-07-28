/**
 * EpgMatchSummary (T071).
 *
 * Four-class classification counts for an EPG match change set: exact, fuzzy,
 * conflict, unmatched. Surfaces which locked manual bindings are preserved.
 * antd v6 visual language: token-driven semantic colors, 4px grid.
 */
import { Tag, theme } from "antd";
import { StatisticCard } from "@ant-design/pro-components";

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
    <div>
      <StatisticCard.Group>
        {CLASS_ITEMS.map((item) => (
          <StatisticCard
            key={item.key}
            statistic={{
              title: item.label,
              value: data[item.key] ?? 0,
              description: "",
              valueStyle:
                item.color === "error" && (data[item.key] ?? 0) > 0
                  ? { color: token.colorError }
                  : undefined,
            }}
          />
        ))}
        {data.preserved != null && (
          <StatisticCard
            statistic={{
              title: "保留人工绑定",
              value: data.preserved,
              description: "",
            }}
          />
        )}
      </StatisticCard.Group>
      {(data.conflict ?? 0) > 0 && (
        <Tag color="error">存在冲突项，需人工处理后才能应用</Tag>
      )}
    </div>
  );
}
