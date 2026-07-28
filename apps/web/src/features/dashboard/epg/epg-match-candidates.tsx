/**
 * EpgMatchCandidates (T071).
 *
 * Paged candidate detail table for an EPG match change set. Filters by
 * classification (exact/fuzzy/conflict/unmatched) and shows confidence,
 * reasonCode and current manual-lock state. Conflict items must be resolved
 * before the change set can be applied (contracts/operation-previews.md).
 */
import { useState } from "react";
import { Alert, Badge, Space, Tag, Typography } from "antd";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import type { ProColumns } from "@ant-design/pro-components";
import { useChangeItems } from "@/features/dashboard/operations/operation-queries";

interface CandidateRow extends Record<string, unknown> {
  itemId: string;
  classification?: string;
  action?: string;
  selected: boolean;
  confidence?: number | null;
  reasonCode?: string;
  manualLocked?: boolean;
}

const CLASS_OPTIONS = [
  { label: "全部", value: "" },
  { label: "精确匹配", value: "exact" },
  { label: "模糊匹配", value: "fuzzy" },
  { label: "冲突", value: "conflict" },
  { label: "未匹配", value: "unmatched" },
];

function classTag(c?: string) {
  const color =
    c === "conflict" ? "error" : c === "fuzzy" ? "warning" : c === "unmatched" ? undefined : "success";
  return <Tag color={color}>{c ?? "—"}</Tag>;
}

export function EpgMatchCandidates({ changeSetId }: { changeSetId: string }) {
  const [page, setPage] = useState(1);
  const [classification, setClassification] = useState("");
  const { data, isLoading } = useChangeItems(changeSetId, page, classification || undefined);

  const columns: ProColumns<CandidateRow>[] = [
    {
      title: "分类",
      dataIndex: "classification",
      width: 110,
      render: (_, record) => classTag(record.classification),
    },
    { title: "动作", dataIndex: "action", width: 110 },
    {
      title: "状态",
      dataIndex: "selected",
      width: 90,
      render: (_, record) =>
        record.selected ? (
          <Badge status="processing" text="已选" />
        ) : (
          <Badge status="default" text="未选" />
        ),
    },
    {
      title: "可信度",
      dataIndex: "confidence",
      width: 90,
      render: (_, record) =>
        record.confidence != null ? `${Math.round(record.confidence * 100)}%` : "—",
    },
    { title: "依据", dataIndex: "reasonCode" },
    {
      title: "人工锁定",
      dataIndex: "manualLocked",
      width: 90,
      render: (_, record) =>
        record.manualLocked ? <Tag color="blue">已锁</Tag> : "—",
    },
  ];

  const items = (data?.items ?? []) as CandidateRow[];
  const total = data?.total ?? 0;
  const conflicts = items.filter((i) => i.classification === "conflict");

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Space>
        {CLASS_OPTIONS.map((opt) => (
          <Typography.Link
            key={opt.value}
            strong={classification === opt.value}
            onClick={() => {
              setClassification(opt.value);
              setPage(1);
            }}
          >
            {opt.label}
          </Typography.Link>
        ))}
      </Space>
      {conflicts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title={`${conflicts.length} 个冲突项需人工处理`}
          description="冲突项必须逐一确认候选后才能被选中并应用。"
        />
      )}
      <ProTableWrapper<CandidateRow>
        columns={columns}
        dataSource={items}
        rowKey="itemId"
        loading={isLoading}
        proTableProps={{
          pagination: {
            current: page,
            pageSize: 20,
            total,
            onChange: (p: number) => setPage(p),
          },
        }}
      />
    </Space>
  );
}
